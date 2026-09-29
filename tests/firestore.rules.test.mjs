// Firestore 보안 규칙 테스트 — npm run test:rules (에뮬레이터, demo 프로젝트라 실제 데이터와 무관)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';

const SCHOOL = 'seonyoo-hs';
const emailToDocId = (e) => e.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__');

const ADMIN = { uid: 'admin1', email: 'boss@seonyoo.hs.kr' };
const MANAGER = { uid: 'mgr1', email: 'Teacher.Kim@seonyoo.hs.kr' }; // 대소문자·점 섞인 이메일
const STRANGER = { uid: 'x1', email: 'nobody@seonyoo.hs.kr' };
const OUTSIDER = { uid: 'o1', email: 'someone@gmail.com' };
const OTHER_ADMIN = { uid: 'admin2', email: 'boss2@seonyoo.hs.kr' }; // 다른 학교 관리자

let env;
const as = (u) => env.authenticatedContext(u.uid, { email: u.email, email_verified: true }).firestore();
const examRef = (db) => doc(db, 'schools', SCHOOL, 'exams', 'e1');
const managerRef = (db, email) => doc(db, 'schools', SCHOOL, 'examRosterManagers', emailToDocId(email));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-exam-roster',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', ADMIN.uid), { email: ADMIN.email, role: 'admin', schoolId: SCHOOL });
    await setDoc(doc(db, 'users', OTHER_ADMIN.uid), { email: OTHER_ADMIN.email, role: 'admin', schoolId: 'other-hs' });
    await setDoc(managerRef(db, MANAGER.email), { email: MANAGER.email.toLowerCase(), name: '', addedBy: ADMIN.uid });
    await setDoc(examRef(db), { title: '중간고사' });
    await setDoc(doc(db, 'schools', SCHOOL, 'exams', 'e1', 'grades', '1학년'), { grade: '1학년' });
  });
});

describe('관리자', () => {
  it('시험 자료 읽기·쓰기·삭제', async () => {
    const db = as(ADMIN);
    await assertSucceeds(getDoc(examRef(db)));
    await assertSucceeds(setDoc(examRef(db), { title: '수정' }));
    await assertSucceeds(deleteDoc(examRef(db)));
  });
  it('담당교사 지정·목록·해제', async () => {
    const db = as(ADMIN);
    await assertSucceeds(setDoc(managerRef(db, 'new@seonyoo.hs.kr'), { email: 'new@seonyoo.hs.kr' }));
    await assertSucceeds(getDocs(collection(db, 'schools', SCHOOL, 'examRosterManagers')));
    await assertSucceeds(deleteDoc(managerRef(db, 'new@seonyoo.hs.kr')));
  });
});

describe('담당교사', () => {
  it('시험 자료 읽기·저장, 결번 저장', async () => {
    const db = as(MANAGER);
    await assertSucceeds(getDoc(examRef(db)));
    await assertSucceeds(setDoc(examRef(db), { title: '담당교사 수정' }));
    await assertSucceeds(setDoc(doc(db, 'schools', SCHOOL, 'exams', 'e1', 'grades', '1학년'), { grade: '1학년', x: 1 }));
    await assertSucceeds(setDoc(doc(db, 'schools', SCHOOL, 'vacancies', '2026'), { items: [] }));
  });
  it('시험 자료 삭제는 안 됨', async () => {
    await assertFails(deleteDoc(examRef(as(MANAGER))));
  });
  it('다른 담당교사 지정·해제는 안 됨', async () => {
    const db = as(MANAGER);
    await assertFails(setDoc(managerRef(db, 'friend@seonyoo.hs.kr'), { email: 'friend@seonyoo.hs.kr' }));
    await assertFails(deleteDoc(managerRef(db, MANAGER.email)));
  });
  it('본인 문서에 uid·이름·접속 시각만 기록 가능', async () => {
    const db = as(MANAGER);
    await assertSucceeds(updateDoc(managerRef(db, MANAGER.email), { uid: MANAGER.uid, name: '김선생', lastLoginAt: new Date() }));
    await assertFails(updateDoc(managerRef(db, MANAGER.email), { email: 'hijack@seonyoo.hs.kr' }));
  });
});

describe('지정되지 않은 학교 계정', () => {
  it('시험 자료·담당교사 목록 접근 불가', async () => {
    const db = as(STRANGER);
    await assertFails(getDoc(examRef(db)));
    await assertFails(setDoc(examRef(db), { title: '해킹' }));
    await assertFails(getDocs(collection(db, 'schools', SCHOOL, 'examRosterManagers')));
    await assertFails(getDoc(doc(db, 'schools', SCHOOL, 'vacancies', '2026')));
  });
  it('자기 자신을 담당교사로 등록 불가', async () => {
    const db = as(STRANGER);
    await assertFails(setDoc(managerRef(db, STRANGER.email), { email: STRANGER.email }));
  });
  it('본인 담당교사 문서 조회는 가능(없음 확인용)', async () => {
    await assertSucceeds(getDoc(managerRef(as(STRANGER), STRANGER.email)));
  });
  it('계정 문서는 teacher로만 만들고, 역할을 바꿀 수 없음', async () => {
    const db = as(STRANGER);
    await assertFails(setDoc(doc(db, 'users', STRANGER.uid), { email: STRANGER.email, role: 'admin', schoolId: SCHOOL }));
    await assertSucceeds(setDoc(doc(db, 'users', STRANGER.uid), { email: STRANGER.email, role: 'teacher', schoolId: SCHOOL }));
    await assertFails(updateDoc(doc(db, 'users', STRANGER.uid), { role: 'admin' }));
  });
});

describe('차단', () => {
  it('학교 도메인이 아닌 계정', async () => {
    const db = as(OUTSIDER);
    await assertFails(getDoc(examRef(db)));
    await assertFails(setDoc(doc(db, 'users', OUTSIDER.uid), { email: OUTSIDER.email, role: 'teacher', schoolId: SCHOOL }));
  });
  it('다른 학교 관리자', async () => {
    const db = as(OTHER_ADMIN);
    await assertFails(getDoc(examRef(db)));
    await assertFails(setDoc(managerRef(db, 'x@seonyoo.hs.kr'), { email: 'x@seonyoo.hs.kr' }));
  });
  it('로그인하지 않은 사용자', async () => {
    await assertFails(getDoc(examRef(env.unauthenticatedContext().firestore())));
  });
});
