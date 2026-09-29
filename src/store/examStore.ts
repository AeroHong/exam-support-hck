import { create } from 'zustand';
import type { Issue, ParsedWorkbook, SubjectRoster, VacancyItem } from '../core';
import { buildRosters, findConflicts, parseWorkbook, validatePlan } from '../core';

interface ExamState {
  examId: string | null; // Firestore 문서 ID (저장 전이면 null)
  title: string;
  sourceFileName: string;
  workbook: ParsedWorkbook | null;
  vacancies: VacancyItem[];
  rosters: SubjectRoster[];
  issues: Issue[];
  loadFile: (file: File) => Promise<void>;
  setWorkbook: (wb: ParsedWorkbook, meta: { title: string; sourceFileName: string; examId: string | null }) => void;
  setVacancies: (v: VacancyItem[]) => void;
  setExamId: (id: string) => void;
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

  async loadFile(file) {
    const wb = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
    get().setWorkbook(wb, { title: titleFromFileName(file.name), sourceFileName: file.name, examId: null });
  },

  setWorkbook(wb, meta) {
    set({ workbook: wb, ...meta, ...compute(wb, get().vacancies) });
  },

  setVacancies(v) {
    set({ vacancies: v, ...compute(get().workbook, v) });
  },

  setExamId(id) {
    set({ examId: id });
  },

  reset() {
    set({ examId: null, title: '', sourceFileName: '', workbook: null, rosters: [], issues: [] });
  },
}));
