// Firestore 보안 규칙 테스트 — npm run test:rules (에뮬레이터, demo 프로젝트라 실제 데이터와 무관)
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

const SCHOOL = 'seonyoo-hs';
const emailToDocId = (e) => e.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__');

const ADMIN = { uid: 'admin1', email: 'boss@seonyoo.hs.kr' };
const MANAGER = { uid: 'mgr1', email: 'Teacher.Kim@seonyoo.hs.kr' }; // 대소문자·점 섞인 이메일
const STRANGER = { uid: 'x1', email: 'nobody@seonyoo.hs.kr' };
const OUTSIDER = { uid: 'o1', email: 'someone@gmail.com' };
const OTHER_ADMIN = { uid: 'admin2', email: 'boss2@seonyoo.hs.kr' }; // 다른 학교 관리자
const MEMBER_ADMIN = { uid: 'madm', email: 'vice@seonyoo.hs.kr' }; // 사용자 관리에서 관리자로 지정된 교사

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
    await setDoc(managerRef(db, MANAGER.email), { email: MANAGER.email.toLowerCase(), name: '', role: 'manager', addedBy: ADMIN.uid });
    await setDoc(managerRef(db, MEMBER_ADMIN.email), { email: MEMBER_ADMIN.email, name: '', role: 'admin', addedBy: ADMIN.uid });
    await setDoc(examRef(db), { title: '중간고사', revision: 3 });
    await setDoc(doc(db, 'schools', SCHOOL, 'exams', 'e1', 'grades', '1학년'), { grade: '1학년' });
  });
});

describe('관리자', () => {
  it('시험 자료 읽기·쓰기·삭제', async () => {
    const db = as(ADMIN);
    await assertSucceeds(getDoc(examRef(db)));
    await assertSucceeds(setDoc(examRef(db), { title: '수정', revision: 4 }));
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
  it('시험 자료 읽기·저장(결번 포함) — 저장 번호를 1 올리며 학년 시트와 함께', async () => {
    const db = as(MANAGER);
    await assertSucceeds(getDoc(examRef(db)));
    const b = writeBatch(db);
    b.set(examRef(db), { title: '담당교사 수정', vacancies: [], revision: 4 }, { merge: true });
    b.set(doc(db, 'schools', SCHOOL, 'exams', 'e1', 'grades', '1학년'), { grade: '1학년', x: 1 });
    await assertSucceeds(b.commit());
    await assertSucceeds(setDoc(doc(db, 'schools', SCHOOL, 'exams', 'new1'), { title: '새 시험', revision: 1 }));
  });
  it('시험 자료 삭제는 안 됨', async () => {
    await assertFails(deleteDoc(examRef(as(MANAGER))));
  });
  it('다른 담당교사 지정·해제는 안 됨', async () => {
    const db = as(MANAGER);
    await assertFails(setDoc(managerRef(db, 'friend@seonyoo.hs.kr'), { email: 'friend@seonyoo.hs.kr' }));
    await assertFails(deleteDoc(managerRef(db, MANAGER.email)));
  });
  it('본인 문서에 uid·이름·접속 시각만 기록 가능, 스스로 관리자 승격 불가', async () => {
    const db = as(MANAGER);
    await assertSucceeds(updateDoc(managerRef(db, MANAGER.email), { uid: MANAGER.uid, name: '김선생', lastLoginAt: new Date() }));
    await assertFails(updateDoc(managerRef(db, MANAGER.email), { email: 'hijack@seonyoo.hs.kr' }));
    await assertFails(updateDoc(managerRef(db, MANAGER.email), { role: 'admin' }));
  });
});

describe('사용자 관리에서 관리자로 지정된 교사', () => {
  it('다른 사용자 지정·권한 변경·해제, 시험 자료 삭제', async () => {
    const db = as(MEMBER_ADMIN);
    await assertSucceeds(setDoc(managerRef(db, 'new@seonyoo.hs.kr'), { email: 'new@seonyoo.hs.kr', role: 'manager' }));
    await assertSucceeds(updateDoc(managerRef(db, MANAGER.email), { role: 'admin' }));
    await assertSucceeds(deleteDoc(managerRef(db, 'new@seonyoo.hs.kr')));
    await assertSucceeds(deleteDoc(examRef(db)));
  });
  it('이상한 역할 값은 거부', async () => {
    await assertFails(setDoc(managerRef(as(MEMBER_ADMIN), 'x@seonyoo.hs.kr'), { email: 'x@seonyoo.hs.kr', role: 'superuser' }));
  });
});

describe('활동 기록', () => {
  const logsCol = (db) => collection(db, 'schools', SCHOOL, 'activityLogs');
  const entry = (u, extra = {}) => ({
    action: 'print', summary: '인쇄', details: [], examId: 'e1', examTitle: '중간고사',
    uid: u.uid, email: u.email.toLowerCase(), name: '', at: serverTimestamp(), ...extra,
  });

  it('사용자는 본인 이름·서버 시각으로 추가하고, 기록을 볼 수 있다', async () => {
    const db = as(MANAGER);
    await assertSucceeds(setDoc(doc(logsCol(db), 'l1'), entry(MANAGER)));
    await assertSucceeds(getDocs(logsCol(db)));
  });
  it('남의 이름·가짜 시각·추가 필드로는 못 쓴다', async () => {
    const db = as(MANAGER);
    await assertFails(setDoc(doc(logsCol(db), 'l2'), entry(MANAGER, { uid: ADMIN.uid })));
    await assertFails(setDoc(doc(logsCol(db), 'l3'), entry(MANAGER, { email: ADMIN.email })));
    await assertFails(setDoc(doc(logsCol(db), 'l4'), entry(MANAGER, { at: new Date('2020-01-01') })));
    await assertFails(setDoc(doc(logsCol(db), 'l5'), entry(MANAGER, { hidden: true })));
  });
  it('관리자도 기록을 고치거나 지울 수 없다', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'schools', SCHOOL, 'activityLogs', 'fixed'), { action: 'print' }));
    const db = as(ADMIN);
    await assertFails(updateDoc(doc(logsCol(db), 'fixed'), { summary: '조작' }));
    await assertFails(deleteDoc(doc(logsCol(db), 'fixed')));
  });
  it('지정되지 않은 계정은 접근 거부 기록만 남길 수 있고, 기록을 못 본다', async () => {
    const db = as(STRANGER);
    await assertSucceeds(setDoc(doc(logsCol(db), 'd1'), entry(STRANGER, { action: 'access_denied', examId: null, examTitle: '' })));
    await assertFails(setDoc(doc(logsCol(db), 'd2'), entry(STRANGER)));
    await assertFails(getDocs(logsCol(db)));
  });
});

describe('동시 편집 보호 (revision)', () => {
  const gradeRef = (db) => doc(db, 'schools', SCHOOL, 'exams', 'e1', 'grades', '1학년');

  it('내가 연 뒤 다른 사람이 저장했으면(번호가 이미 오름) 내 저장은 거부', async () => {
    const db = as(MANAGER);
    await assertFails(setDoc(examRef(db), { title: '옛 화면', revision: 3 }, { merge: true })); // 같은 번호
    await assertFails(setDoc(examRef(db), { title: '건너뛰기', revision: 6 }, { merge: true })); // 1이 아님
  });
  it('저장 번호가 없는 옛 앱의 저장은 거부', async () => {
    const db = as(MANAGER);
    const b = writeBatch(db);
    b.set(examRef(db), { title: '옛 앱', updatedBy: MANAGER.email }, { merge: true });
    b.set(gradeRef(db), { grade: '1학년', stale: true });
    await assertFails(b.commit());
  });
  it('앱의 실제 저장과 같은 크기의 한 번 쓰기 (시험·학년 3·기준+새 버전·활동 기록)', async () => {
    const db = as(MANAGER);
    const e = (c, id) => doc(db, 'schools', SCHOOL, 'exams', 'e1', c, id);
    const b = writeBatch(db);
    b.set(examRef(db), { title: '저장', revision: 4, versionCount: 2, latestVersionId: 'vb' }, { merge: true });
    for (const g of ['1학년', '2학년', '3학년']) b.set(e('grades', g), { grade: g });
    for (const v of ['va', 'vb']) {
      b.set(e('versions', v), { versionNo: v === 'va' ? 1 : 2 });
      b.set(e('versionData', v), { title: '저장', grades: [] });
    }
    b.set(doc(db, 'schools', SCHOOL, 'activityLogs', 'save1'), {
      action: 'exam_save', summary: 'v2 · 저장', details: [], examId: 'e1', examTitle: '저장', versionId: 'vb',
      uid: MANAGER.uid, email: MANAGER.email.toLowerCase(), name: '', at: serverTimestamp(),
    });
    await assertSucceeds(b.commit());
  });
  it('학년 시트만 따로 덮어쓰기 거부', async () => {
    await assertFails(setDoc(gradeRef(as(MANAGER)), { grade: '1학년', stale: true }));
  });
});

describe('데이터 버전', () => {
  const vRef = (db, c, id) => doc(db, 'schools', SCHOOL, 'exams', 'e1', c, id);

  it('사용자는 저장과 함께 버전을 추가·조회하지만 고치거나 지울 수 없다', async () => {
    const db = as(MANAGER);
    const b = writeBatch(db);
    b.set(examRef(db), { revision: 4, versionCount: 1 }, { merge: true });
    b.set(vRef(db, 'versions', 'v1'), { versionNo: 1, action: 'exam_save' });
    b.set(vRef(db, 'versionData', 'v1'), { title: 't', plan: [], grades: [] });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(vRef(db, 'versions', 'v2'), { versionNo: 2 })); // 저장 없이 버전만
    await assertSucceeds(getDocs(collection(db, 'schools', SCHOOL, 'exams', 'e1', 'versions')));
    await assertFails(updateDoc(vRef(db, 'versions', 'v1'), { summary: '조작' }));
    await assertFails(setDoc(vRef(db, 'versionData', 'v1'), { title: '덮어쓰기' }));
    await assertFails(deleteDoc(vRef(db, 'versions', 'v1')));
  });
  it('관리자는 시험 자료를 지울 때 버전도 지울 수 있다', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(vRef(ctx.firestore(), 'versions', 'v9'), { versionNo: 9 }));
    await assertSucceeds(deleteDoc(vRef(as(ADMIN), 'versions', 'v9')));
  });
  it('지정되지 않은 계정은 버전을 볼 수 없다', async () => {
    await assertFails(getDocs(collection(as(STRANGER), 'schools', SCHOOL, 'exams', 'e1', 'versionData')));
  });
  it('활동 기록에 버전 번호를 남길 수 있다', async () => {
    const db = as(MANAGER);
    await assertSucceeds(
      setDoc(doc(db, 'schools', SCHOOL, 'activityLogs', 'lv'), {
        action: 'exam_save', summary: 'v2 · 저장', details: [], examId: 'e1', examTitle: 't', versionId: 'v2',
        uid: MANAGER.uid, email: MANAGER.email.toLowerCase(), name: '', at: serverTimestamp(),
      }),
    );
  });
});

describe('지정되지 않은 학교 계정', () => {
  it('시험 자료·담당교사 목록 접근 불가', async () => {
    const db = as(STRANGER);
    await assertFails(getDoc(examRef(db)));
    await assertFails(setDoc(examRef(db), { title: '해킹' }));
    await assertFails(getDocs(collection(db, 'schools', SCHOOL, 'examRosterManagers')));
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
