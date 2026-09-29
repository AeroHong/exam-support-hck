import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import type { GradeSheet, ParsedWorkbook, PlanRow, VacancyItem } from '../core';
import { db, SCHOOL_ID } from './app';
import { COL, emailToDocId, type MemberRole } from './schema';
import { addActivityToBatch, type ActivityInput } from './activity';

// /schools/{schoolId}/exams/{examId}                     { title, sourceFileName, plan, vacancies, versionCount, latestVersionId, createdBy, updatedBy, updatedAt }
// /schools/{schoolId}/exams/{examId}/grades/{g}          GradeSheet (~200명, 1MB 이하)
// /schools/{schoolId}/exams/{examId}/versions/{id}       버전 요약 { versionNo, action, summary, details, by, byName, at }
// /schools/{schoolId}/exams/{examId}/versionData/{id}    버전 전체 데이터 { title, sourceFileName, plan, vacancies, grades[] } — 수정·삭제 불가
// /schools/{schoolId}/examRosterManagers/{emailToDocId}  { email, name, role, uid, addedBy, addedByName, addedAt, lastLoginAt }
// /schools/{schoolId}/activityLogs/{autoId}              활동 기록 (activity.ts)

export interface ExamMeta {
  id: string;
  title: string;
  sourceFileName: string;
  createdBy: string;
  updatedBy?: string;
  updatedAt?: Date;
}

export interface ExamData {
  title: string;
  sourceFileName: string;
  workbook: ParsedWorkbook;
  vacancies: VacancyItem[];
}

/** 시험 문서에 함께 저장되는 버전 정보 */
export interface VersionInfo {
  versionCount: number; // 지금까지 만든 버전 수 (0이면 버전 기록 시작 전 자료)
  latestVersionId: string | null;
}

export type VersionAction = 'baseline' | 'exam_create' | 'exam_save' | 'exam_replace' | 'exam_restore';

/** 버전 목록용 요약 — exams/{examId}/versions/{id}. 전체 데이터는 versionData/{같은 id} */
export interface VersionMeta {
  id: string;
  versionNo: number;
  action: VersionAction;
  summary: string;
  details: string[];
  by: string;
  byName: string;
  at?: Date;
}

function need() {
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

const examsCol = () => collection(need(), 'schools', SCHOOL_ID, COL.EXAMS);

export async function listExams(): Promise<ExamMeta[]> {
  const snap = await getDocs(query(examsCol(), orderBy('updatedAt', 'desc')));
  return snap.docs.map((x) => {
    const v = x.data();
    return {
      id: x.id,
      title: v.title,
      sourceFileName: v.sourceFileName,
      createdBy: v.createdBy,
      updatedBy: v.updatedBy,
      updatedAt: v.updatedAt?.toDate?.(),
    };
  });
}

/** Firestore는 undefined 필드를 거부한다 */
const cleanVacancies = (items: VacancyItem[]) => items.map((v) => (v.note ? { ...v } : { hakbeon: v.hakbeon, type: v.type }));

/** 한 시점의 전체 데이터 (~250KB, 문서 1MB 한도 안) */
const snapshotOf = (data: ExamData) => ({
  title: data.title,
  sourceFileName: data.sourceFileName,
  plan: data.workbook.plan,
  vacancies: cleanVacancies(data.vacancies),
  grades: data.workbook.grades,
});

export interface SaveOptions {
  by: string; // 이메일
  byName: string;
  action: Exclude<VersionAction, 'baseline'>;
  summary: string;
  details: string[];
  version: VersionInfo;
  /** 버전 기록 시작 전 자료를 처음 저장할 때, 직전 저장본을 v1 '기준 저장본'으로 남긴다 */
  baseline?: ExamData;
}

export interface SaveResult extends VersionInfo {
  examId: string;
}

/**
 * 시험 자료 저장 — 한 batch로 쓴다:
 *   시험 문서 + 학년 시트 + 새 버전(요약·전체 데이터) + 활동 기록(버전 연결)
 * examId가 없으면 새 문서(자동 ID)를 만든다.
 */
export async function saveExam(examId: string | null, data: ExamData, opts: SaveOptions): Promise<SaveResult> {
  const d = need();
  const examRef = examId ? doc(examsCol(), examId) : doc(examsCol());
  const versionsCol = collection(examRef, COL.VERSIONS);
  const dataCol = collection(examRef, COL.VERSION_DATA);
  const batch = writeBatch(d);
  let n = opts.version.versionCount;

  const writeVersion = (vData: ExamData, meta: { action: VersionAction; summary: string; details: string[] }) => {
    const ref = doc(versionsCol);
    n += 1;
    batch.set(ref, { versionNo: n, ...meta, by: opts.by, byName: opts.byName, at: serverTimestamp() });
    batch.set(doc(dataCol, ref.id), snapshotOf(vData));
    return ref.id;
  };

  if (opts.baseline && n === 0) {
    writeVersion(opts.baseline, { action: 'baseline', summary: '기준 저장본 (버전 기록을 시작하기 전 마지막 저장)', details: [] });
  }
  const versionId = writeVersion(data, { action: opts.action, summary: opts.summary, details: opts.details.slice(0, 301) });

  batch.set(
    examRef,
    {
      title: data.title,
      sourceFileName: data.sourceFileName,
      plan: data.workbook.plan,
      vacancies: cleanVacancies(data.vacancies),
      versionCount: n,
      latestVersionId: versionId,
      updatedBy: opts.by,
      updatedAt: serverTimestamp(),
      ...(examId ? {} : { createdBy: opts.by, createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
  for (const g of data.workbook.grades) batch.set(doc(examRef, COL.GRADES, g.grade), g);
  addActivityToBatch(batch, {
    action: opts.action,
    examId: examRef.id,
    examTitle: data.title,
    summary: `v${n} · ${opts.summary}`,
    details: opts.details,
    versionId,
  });
  await batch.commit();
  return { examId: examRef.id, versionCount: n, latestVersionId: versionId };
}

export async function loadExam(examId: string): Promise<ExamData & VersionInfo> {
  const examRef = doc(examsCol(), examId);
  const snap = await getDoc(examRef);
  if (!snap.exists()) throw new Error('시험 자료를 찾을 수 없습니다.');
  const v = snap.data();
  const gradesSnap = await getDocs(collection(examRef, COL.GRADES));
  const grades = gradesSnap.docs.map((x) => x.data() as GradeSheet).sort((a, b) => a.grade.localeCompare(b.grade));
  return {
    title: v.title,
    sourceFileName: v.sourceFileName,
    workbook: { plan: v.plan as PlanRow[], grades },
    vacancies: (v.vacancies as VacancyItem[] | undefined) ?? [],
    versionCount: v.versionCount ?? 0,
    latestVersionId: v.latestVersionId ?? null,
  };
}

export async function listVersions(examId: string): Promise<VersionMeta[]> {
  const snap = await getDocs(query(collection(doc(examsCol(), examId), COL.VERSIONS), orderBy('versionNo', 'desc')));
  return snap.docs.map((x) => {
    const v = x.data();
    return {
      id: x.id,
      versionNo: v.versionNo,
      action: v.action,
      summary: v.summary,
      details: v.details ?? [],
      by: v.by,
      byName: v.byName,
      at: v.at?.toDate?.(),
    };
  });
}

export async function loadVersionData(examId: string, versionId: string): Promise<ExamData> {
  const snap = await getDoc(doc(doc(examsCol(), examId), COL.VERSION_DATA, versionId));
  if (!snap.exists()) throw new Error('버전 데이터를 찾을 수 없습니다.');
  const v = snap.data();
  return {
    title: v.title,
    sourceFileName: v.sourceFileName,
    workbook: { plan: v.plan as PlanRow[], grades: (v.grades as GradeSheet[]).sort((a, b) => a.grade.localeCompare(b.grade)) },
    vacancies: (v.vacancies as VacancyItem[] | undefined) ?? [],
  };
}

/** 다른 시험의 결번 목록 (결번 관리에서 "가져오기") */
export async function loadExamVacancies(examId: string): Promise<VacancyItem[]> {
  const snap = await getDoc(doc(examsCol(), examId));
  return (snap.data()?.vacancies as VacancyItem[] | undefined) ?? [];
}

/** 시험 자료 삭제 — 학년 시트·버전까지 지운다 (batch 500건 한도라 나눠서) */
export async function deleteExam(examId: string, activity: ActivityInput): Promise<void> {
  const d = need();
  const examRef = doc(examsCol(), examId);
  const children = (
    await Promise.all([COL.GRADES, COL.VERSIONS, COL.VERSION_DATA].map((c) => getDocs(collection(examRef, c))))
  ).flatMap((snap) => snap.docs.map((x) => x.ref));
  for (let i = 0; i < children.length; i += 400) {
    const batch = writeBatch(d);
    children.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  const batch = writeBatch(d);
  batch.delete(examRef);
  addActivityToBatch(batch, activity);
  await batch.commit();
}

// ── 사용자 (schools/{schoolId}/examRosterManagers/{emailToDocId}) ──────────

export interface Member {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  uid?: string;
  addedByName?: string;
  addedAt?: Date;
  lastLoginAt?: Date;
}

const membersCol = () => collection(need(), 'schools', SCHOOL_ID, COL.EXAM_ROSTER_MANAGERS);

export async function listMembers(): Promise<Member[]> {
  const snap = await getDocs(membersCol());
  return snap.docs
    .map((x) => {
      const v = x.data();
      return {
        id: x.id,
        email: v.email,
        name: v.name ?? '',
        role: (v.role as MemberRole) ?? 'manager',
        uid: v.uid,
        addedByName: v.addedByName,
        addedAt: v.addedAt?.toDate?.(),
        lastLoginAt: v.lastLoginAt?.toDate?.(),
      };
    })
    .sort((a, b) => (a.role === b.role ? a.email.localeCompare(b.email) : a.role === 'admin' ? -1 : 1));
}

/** 이메일로 사용자 지정 — 아직 로그인한 적 없는 교사도 미리 지정할 수 있다 */
export async function addMembers(emails: string[], role: MemberRole, addedBy: { uid: string; name: string }, activity: ActivityInput): Promise<void> {
  const batch = writeBatch(need());
  for (const raw of emails) {
    const email = raw.toLowerCase();
    batch.set(doc(membersCol(), emailToDocId(email)), {
      email,
      name: '',
      role,
      addedBy: addedBy.uid,
      addedByName: addedBy.name,
      addedAt: serverTimestamp(),
    });
  }
  addActivityToBatch(batch, activity);
  await batch.commit();
}

export async function setMemberRole(id: string, role: MemberRole, activity: ActivityInput): Promise<void> {
  const batch = writeBatch(need());
  batch.update(doc(membersCol(), id), { role });
  addActivityToBatch(batch, activity);
  await batch.commit();
}

export async function removeMember(id: string, activity: ActivityInput): Promise<void> {
  const batch = writeBatch(need());
  batch.delete(doc(membersCol(), id));
  addActivityToBatch(batch, activity);
  await batch.commit();
}
