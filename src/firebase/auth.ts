import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ALLOWED_DOMAIN, auth, db, SCHOOL_ID } from './app';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

export type Role = 'admin' | 'teacher';
export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: Role;
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

async function ensureUserDoc(u: User): Promise<AppUser> {
  const base = { uid: u.uid, email: u.email ?? '', name: u.displayName ?? u.email ?? '' };
  if (!db) return { ...base, role: 'admin' };
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { ...base, role: (snap.data().role as Role) ?? 'teacher' };
  // 첫 로그인은 교사 권한. 관리자 지정은 Firebase 콘솔에서 role을 'admin'으로 수정.
  await setDoc(ref, { ...base, role: 'teacher', schoolId: SCHOOL_ID, createdAt: serverTimestamp() });
  return { ...base, role: 'teacher' };
}

export async function signIn(): Promise<void> {
  if (!auth) return;
  const cred = await signInWithPopup(auth, provider(false));
  if (!domainOk(cred.user.email)) {
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
  const [loading, setLoading] = useState(!!auth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const a = auth;
    return onAuthStateChanged(a, async (u) => {
      try {
        if (!u) setUser(null);
        else if (!domainOk(u.email)) {
          await fbSignOut(a);
          setError(domainError().message);
        } else setUser(await ensureUserDoc(u));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return { user, loading, error, setError };
}
