import { create } from 'zustand';
import type { Issue, ParsedWorkbook, SubjectRoster, VacancyItem } from '../core';
import { buildRosters, findConflicts, validatePlan } from '../core';
import type { VersionInfo } from '../firebase/repo';

const HISTORY_LIMIT = 50;

/** 마지막으로 저장된 상태 — 저장할 때 무엇이 바뀌었는지 비교해 활동 기록에 남긴다 */
export interface SavedSnapshot {
  workbook: ParsedWorkbook;
  title: string;
  vacancies: VacancyItem[];
}

interface ExamState {
  examId: string | null; // Firestore 문서 ID (로컬 모드는 'local')
  title: string;
  sourceFileName: string;
  workbook: ParsedWorkbook | null;
  vacancies: VacancyItem[];
  rosters: SubjectRoster[];
  issues: Issue[];
  dirty: boolean; // 저장 후 수정한 내용이 있는지
  saved: SavedSnapshot | null;
  version: VersionInfo; // 서버의 버전 번호 (저장할 때 다음 번호를 매긴다)
  history: ParsedWorkbook[]; // 되돌리기용 이전 상태
  /** 시험 자료 열기(저장된 상태로) */
  openExam: (
    examId: string,
    data: { title: string; sourceFileName: string; workbook: ParsedWorkbook; vacancies: VacancyItem[] } & Partial<VersionInfo>,
  ) => void;
  /** 데이터 수정 — editWorkbook.ts의 순수 함수를 넘긴다 */
  edit: (fn: (wb: ParsedWorkbook) => ParsedWorkbook) => void;
  undo: () => void;
  setTitle: (title: string) => void;
  setVacancies: (v: VacancyItem[]) => void;
  markSaved: (examId: string, version?: VersionInfo) => void;
  close: () => void;
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
  saved: null,
  version: { versionCount: 0, latestVersionId: null },
  history: [],

  openExam(examId, { versionCount = 0, latestVersionId = null, ...data }) {
    set({
      examId,
      ...data,
      version: { versionCount, latestVersionId },
      ...compute(data.workbook, data.vacancies),
      dirty: false,
      history: [],
      saved: { workbook: data.workbook, title: data.title, vacancies: data.vacancies },
    });
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

  setVacancies(v) {
    set({ vacancies: v, ...compute(get().workbook, v), dirty: true });
  },

  markSaved(examId, version) {
    const { workbook, title, vacancies } = get();
    set({ examId, dirty: false, saved: workbook ? { workbook, title, vacancies } : null, ...(version ? { version } : {}) });
  },

  close() {
    set({
      examId: null,
      title: '',
      sourceFileName: '',
      workbook: null,
      vacancies: [],
      rosters: [],
      issues: [],
      dirty: false,
      saved: null,
      version: { versionCount: 0, latestVersionId: null },
      history: [],
    });
  },
}));
