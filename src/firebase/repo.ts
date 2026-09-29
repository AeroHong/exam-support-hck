import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { GradeSheet, ParsedWorkbook, PlanRow, VacancyItem } from '../core';
import { db, SCHOOL_ID } from './app';

// /schools/{schoolId}/exams/{examId}             { title, sourceFileName, plan, createdBy, updatedAt }
// /schools/{schoolId}/exams/{examId}/grades/{g}  GradeSheet (~200명, 1MB 이하)
// /schools/{schoolId}/vacancies/{year}           { items: VacancyItem[] }

export interface ExamMeta {
  id: string;
  title: string;
  sourceFileName: string;
  createdBy: string;
  updatedAt?: Date;
}

function need() {
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return db;
}

const examsCol = () => collection(need(), 'schools', SCHOOL_ID, 'exams');

export async function listExams(): Promise<ExamMeta[]> {
  const snap = await getDocs(query(examsCol(), orderBy('updatedAt', 'desc')));
  return snap.docs.map((x) => {
    const v = x.data();
    return { id: x.id, title: v.title, sourceFileName: v.sourceFileName, createdBy: v.createdBy, updatedAt: v.updatedAt?.toDate?.() };
  });
}

export async function saveExam(
  examId: string,
  data: { title: string; sourceFileName: string; workbook: ParsedWorkbook; createdBy: string },
): Promise<void> {
  const d = need();
  const examRef = doc(examsCol(), examId);
  const batch = writeBatch(d);
  batch.set(examRef, {
    title: data.title,
    sourceFileName: data.sourceFileName,
    plan: data.workbook.plan,
    createdBy: data.createdBy,
    updatedAt: serverTimestamp(),
  });
  for (const g of data.workbook.grades) batch.set(doc(examRef, 'grades', g.grade), g);
  await batch.commit();
}

export async function loadExam(examId: string): Promise<{ title: string; sourceFileName: string; workbook: ParsedWorkbook }> {
  const examRef = doc(examsCol(), examId);
  const snap = await getDoc(examRef);
  if (!snap.exists()) throw new Error('시험 자료를 찾을 수 없습니다.');
  const v = snap.data();
  const gradesSnap = await getDocs(collection(examRef, 'grades'));
  const grades = gradesSnap.docs.map((x) => x.data() as GradeSheet).sort((a, b) => a.grade.localeCompare(b.grade));
  return { title: v.title, sourceFileName: v.sourceFileName, workbook: { plan: v.plan as PlanRow[], grades } };
}

export async function deleteExam(examId: string): Promise<void> {
  const d = need();
  const examRef = doc(examsCol(), examId);
  const gradesSnap = await getDocs(collection(examRef, 'grades'));
  const batch = writeBatch(d);
  gradesSnap.docs.forEach((x) => batch.delete(x.ref));
  batch.delete(examRef);
  await batch.commit();
}

export async function loadVacancies(year: string): Promise<VacancyItem[]> {
  const snap = await getDoc(doc(need(), 'schools', SCHOOL_ID, 'vacancies', year));
  return snap.exists() ? ((snap.data().items as VacancyItem[]) ?? []) : [];
}

export async function saveVacancies(year: string, items: VacancyItem[]): Promise<void> {
  await setDoc(doc(need(), 'schools', SCHOOL_ID, 'vacancies', year), { items, updatedAt: serverTimestamp() });
}
