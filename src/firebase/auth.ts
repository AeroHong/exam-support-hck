import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ALLOWED_DOMAIN, auth, db, SCHOOL_ID } from './app';
import { ADMIN_ROLES, COL, emailToDocId, USERS } from './schema';
import { logActivity } from './activity';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

/**
 * admin   — 관리자: users.role이 admin/school_admin(계정 관리자) 또는 examRosterManagers.role이 admin
 *           모든 기능 + 사용자·권한 관리·자료 삭제
 * manager — 담당교사: examRosterManagers에 지정됨, 삭제 외 모든 기능
 */
export type Role = 'admin' | 'manager';
export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
}

/** 로그인은 됐지만 담당교사로 지정되지 않은 계정 */
export interface DeniedUser {
  email: string;
  name: string;
}

const domainError = () => new Error(`${ALLOWED_DOMAIN} 계정으로만 로그인할 수 있습니다.`);

function domainOk(email: string | null): boolean {
  if (!ALLOWED_DOMAIN) return true;
  return !!email && email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN.toLowerCase());
}

function provider(withDrive: boolean): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  p.setCustomParameters(ALLOWED_DOMAIN ? { hd: ALLOWED_DOMAIN, prompt: 'select_account' } : { prompt: 'select_account' });
  if (withDrive) DRIVE_SCOPES.forEach((s) => p.addScope(s));
  return p;
}

/**
 * 권한 판정 — smart-teachers-office AuthContext와 같은 흐름.
 * ① users/{uid}가 없으면 teacher로 만든다(role·schoolId는 본인이 바꿀 수 없음)
 * ② users.role이 관리자면 admin
 * ③ 아니면 examRosterManagers/{emailToDocId}가 있으면 manager (첫 로그인 시 uid·이름·접속 시각 기록)
 * ④ 둘 다 아니면 접근 거부
 */
async function resolveAccess(u: User): Promise<AppUser | DeniedUser> {
  const email = (u.email ?? '').toLowerCase();
  const name = u.displayName ?? email;
  if (!db) return { uid: u.uid, email, name, role: 'admin' };

  const userRef = doc(db, USERS, u.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, { name, email, role: 'teacher', schoolId: SCHOOL_ID, createdAt: serverTimestamp() });
  } else if (ADMIN_ROLES.includes(userSnap.data().role) && userSnap.data().schoolId === SCHOOL_ID) {
    updateDoc(userRef, { lastLoginAt: serverTimestamp() }).catch(() => {});
    return { uid: u.uid, email, name, role: 'admin' };
  }

  const managerRef = doc(db, 'schools', SCHOOL_ID, COL.EXAM_ROSTER_MANAGERS, emailToDocId(email));
  const managerSnap = await getDoc(managerRef).catch(() => null);
  if (managerSnap?.exists()) {
    updateDoc(managerRef, { uid: u.uid, name, lastLoginAt: serverTimestamp() }).catch(() => {});
    return { uid: u.uid, email, name, role: managerSnap.data().role === 'admin' ? 'admin' : 'manager' };
  }
  return { email, name };
}

// 새로고침마다 로그인 기록이 쌓이지 않도록, 직접 로그인 버튼을 눌렀을 때만 기록한다
let justSignedIn = false;

export async function signIn(): Promise<void> {
  if (!auth) return;
  justSignedIn = true;
  const cred = await signInWithPopup(auth, provider(false));
  if (!domainOk(cred.user.email)) {
    justSignedIn = false;
    await fbSignOut(auth);
    throw domainError();
  }
}

let googleToken: { token: string; expires: number } | null = null;

export async function signOut(): Promise<void> {
  googleToken = null;
  if (auth) await fbSignOut(auth);
}

/** Google Sheets·Drive API용 액세스 토큰. 처음 한 번은 팝업으로 추가 권한 동의를 받는다. */
export async function getGoogleAccessToken(): Promise<string> {
  if (googleToken && googleToken.expires > Date.now() + 60_000) return googleToken.token;
  if (!auth) throw new Error('Firebase가 설정되지 않아 Google 연동을 사용할 수 없습니다.');
  const cred = await signInWithPopup(auth, provider(true));
  if (!domainOk(cred.user.email)) {
    await fbSignOut(auth);
    throw domainError();
  }
  const token = GoogleAuthProvider.credentialFromResult(cred)?.accessToken;
  if (!token) throw new Error('Google 액세스 토큰을 받지 못했습니다.');
  googleToken = { token, expires: Date.now() + 55 * 60_000 };
  return token;
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [denied, setDenied] = useState<DeniedUser | null>(null);
  const [loading, setLoading] = useState(!!auth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const a = auth;
    return onAuthStateChanged(a, async (u) => {
      setLoading(true);
      try {
        setUser(null);
        setDenied(null);
        if (!u) return;
        if (!domainOk(u.email)) {
          await fbSignOut(a);
          setError(domainError().message);
          return;
        }
        const access = await resolveAccess(u);
        if ('role' in access) {
          setUser(access);
          if (justSignedIn) logActivity({ action: 'login', summary: `${access.role === 'admin' ? '관리자' : '담당교사'} 로그인` });
        } else {
          setDenied(access);
          logActivity({ action: 'access_denied', summary: `지정되지 않은 계정의 접근 시도: ${access.email}` });
        }
        justSignedIn = false;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return { user, denied, loading, error, setError };
}
