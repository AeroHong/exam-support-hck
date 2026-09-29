import { create } from 'zustand';
import type { Issue, ParsedWorkbook, SubjectRoster, VacancyItem } from '../core';
import { buildRosters, findConflicts, validatePlan } from '../core';
import { EMPTY_VERSION, type VersionInfo } from '../firebase/repo';

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
  version: VersionInfo; // 내가 연 저장본의 버전·저장 번호 (저장할 때 서버와 비교)
  saving: boolean; // 저장 중 — 내 저장이 실시간 알림으로 되돌아올 때 무시하기 위해
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
  setSaving: (v: boolean) => void;
  /** 동시 편집: 최신 저장본을 기준으로 삼고, 그 위에 합친 내 변경을 '저장 안 됨' 상태로 올린다 */
  rebase: (
    latest: { title: string; sourceFileName: string; workbook: ParsedWorkbook; vacancies: VacancyItem[] } & VersionInfo,
    merged: { title: string; workbook: ParsedWorkbook; vacancies: VacancyItem[] },
  ) => void;
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
  version: EMPTY_VERSION,
  saving: false,
  history: [],

  openExam(examId, { versionCount = 0, latestVersionId = null, revision = 0, ...data }) {
    set({
      examId,
      ...data,
      version: { versionCount, latestVersionId, revision },
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

  setSaving(v) {
    set({ saving: v });
  },

  rebase(latest, merged) {
    const { versionCount, latestVersionId, revision, ...saved } = latest;
    set({
      title: merged.title,
      sourceFileName: saved.sourceFileName,
      workbook: merged.workbook,
      vacancies: merged.vacancies,
      ...compute(merged.workbook, merged.vacancies),
      saved: { workbook: saved.workbook, title: saved.title, vacancies: saved.vacancies },
      version: { versionCount, latestVersionId, revision },
      dirty: true,
      history: [],
    });
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
      version: EMPTY_VERSION,
      saving: false,
      history: [],
    });
  },
}));
