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

// /schools/{schoolId}/exams/{examId}                     { title, sourceFileName, plan, vacancies, createdBy, updatedBy, updatedAt }
// /schools/{schoolId}/exams/{examId}/grades/{g}          GradeSheet (~200명, 1MB 이하)
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

/**
 * 시험 자료 저장 — 시험 문서·학년 시트·활동 기록을 한 batch로 쓴다.
 * examId가 없으면 새 문서(자동 ID)를 만들고 그 ID를 돌려준다.
 */
export async function saveExam(
  examId: string | null,
  data: ExamData,
  by: string,
  activity: (id: string) => ActivityInput,
): Promise<string> {
  const d = need();
  const examRef = examId ? doc(examsCol(), examId) : doc(examsCol());
  const batch = writeBatch(d);
  batch.set(
    examRef,
    {
      title: data.title,
      sourceFileName: data.sourceFileName,
      plan: data.workbook.plan,
      vacancies: cleanVacancies(data.vacancies),
      updatedBy: by,
      updatedAt: serverTimestamp(),
      ...(examId ? {} : { createdBy: by, createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
  for (const g of data.workbook.grades) batch.set(doc(examRef, COL.GRADES, g.grade), g);
  addActivityToBatch(batch, activity(examRef.id));
  await batch.commit();
  return examRef.id;
}

export async function loadExam(examId: string): Promise<ExamData> {
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
  };
}

/** 다른 시험의 결번 목록 (결번 관리에서 "가져오기") */
export async function loadExamVacancies(examId: string): Promise<VacancyItem[]> {
  const snap = await getDoc(doc(examsCol(), examId));
  return (snap.data()?.vacancies as VacancyItem[] | undefined) ?? [];
}

export async function deleteExam(examId: string, activity: ActivityInput): Promise<void> {
  const d = need();
  const examRef = doc(examsCol(), examId);
  const gradesSnap = await getDocs(collection(examRef, COL.GRADES));
  const batch = writeBatch(d);
  gradesSnap.docs.forEach((x) => batch.delete(x.ref));
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
