import { create } from 'zustand';
import type { Issue, ParsedWorkbook, SubjectRoster, VacancyItem } from '../core';
import { buildRosters, findConflicts, parseWorkbook, validatePlan } from '../core';

const HISTORY_LIMIT = 50;

interface ExamState {
  examId: string | null; // Firestore 문서 ID (저장 전이면 null)
  title: string;
  sourceFileName: string;
  workbook: ParsedWorkbook | null;
  vacancies: VacancyItem[];
  rosters: SubjectRoster[];
  issues: Issue[];
  dirty: boolean; // 저장 후 수정한 내용이 있는지
  history: ParsedWorkbook[]; // 되돌리기용 이전 상태
  loadFile: (file: File) => Promise<void>;
  setWorkbook: (wb: ParsedWorkbook, meta: { title: string; sourceFileName: string; examId: string | null }) => void;
  /** 데이터 수정 — editWorkbook.ts의 순수 함수를 넘긴다 */
  edit: (fn: (wb: ParsedWorkbook) => ParsedWorkbook) => void;
  undo: () => void;
  markSaved: (examId: string) => void;
  setTitle: (title: string) => void;
  setVacancies: (v: VacancyItem[]) => void;
  reset: () => void;
}

function compute(wb: ParsedWorkbook | null, vacancies: VacancyItem[]) {
  if (!wb) return { rosters: [], issues: [] };
  const { rosters, issues } = buildRosters(wb, { vacancies });
  return { rosters, issues: [...validatePlan(wb), ...issues, ...findConflicts(rosters)] };
}

export const titleFromFileName = (name: string) => name.replace(/\.(xlsx|xls)$/i, '').replace(/\s*응시현황\s*$/, '');

export const useExamStore = create<ExamState>((set, get) => ({
  examId: null,
  title: '',
  sourceFileName: '',
  workbook: null,
  vacancies: [],
  rosters: [],
  issues: [],
  dirty: false,
  history: [],

  async loadFile(file) {
    const wb = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
    get().setWorkbook(wb, { title: titleFromFileName(file.name), sourceFileName: file.name, examId: null });
    set({ dirty: true }); // 새로 올린 파일은 아직 저장 전
  },

  setWorkbook(wb, meta) {
    set({ workbook: wb, ...meta, ...compute(wb, get().vacancies), dirty: false, history: [] });
  },

  edit(fn) {
    const { workbook, history, vacancies } = get();
    if (!workbook) return;
    const next = fn(workbook);
    if (next === workbook) return;
    set({ workbook: next, ...compute(next, vacancies), dirty: true, history: [...history, workbook].slice(-HISTORY_LIMIT) });
  },

  undo() {
    const { history, vacancies } = get();
    const prev = history[history.length - 1];
    if (!prev) return;
    set({ workbook: prev, ...compute(prev, vacancies), dirty: true, history: history.slice(0, -1) });
  },

  setTitle(title) {
    set({ title, dirty: true });
  },

  markSaved(examId) {
    set({ examId, dirty: false });
  },

  setVacancies(v) {
    set({ vacancies: v, ...compute(get().workbook, v) });
  },

  reset() {
    set({ examId: null, title: '', sourceFileName: '', workbook: null, rosters: [], issues: [], dirty: false, history: [] });
  },
}));
