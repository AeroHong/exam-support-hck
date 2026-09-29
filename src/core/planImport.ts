// 한글 시간표로 읽은 시험을 지금 시험 계획과 비교하고, 적용할 새 시험 계획을 만든다.
import type { ParsedWorkbook, PlanRow } from './types';
import type { TimetableEntry } from './hwpxTimetable';
import { findSubjectColumn, normalizeSubject } from './subject';

export type ImportStatus = 'same' | 'changed' | 'added' | 'removed';

export interface ImportRow {
  status: ImportStatus;
  grade: string;
  subject: string;
  entry?: TimetableEntry; // 시간표 값
  current?: PlanRow; // 지금 시험 계획 값
  changes: string[]; // 바뀌는 항목 설명
  noColumn: boolean; // 학년 명렬에 이 과목 열이 없음 (현황표를 못 만듦)
}

export interface ImportPlan {
  rows: ImportRow[];
  merged: PlanRow[]; // 적용하면 이렇게 됨 (시간표에 있는 학년은 시간표로, 없는 학년은 그대로)
  counts: Record<ImportStatus, number>;
}

const FIELDS: { key: keyof PlanRow; label: string }[] = [
  { key: 'dateStr', label: '날짜' },
  { key: 'period', label: '교시' },
  { key: 'subject', label: '과목명' },
  { key: 'code', label: '코드' },
  { key: 'timeRange', label: '시간' },
  { key: 'minutes', label: '시간(분)' },
];

const toPlanRow = (e: TimetableEntry): PlanRow => ({
  row: 0,
  dateStr: e.dateStr,
  period: e.period,
  grade: e.grade,
  subject: e.subject,
  code: e.code,
  timeRange: e.timeRange,
  minutes: e.minutes,
});

/** 같은 시험인지: 학년 + 과목명(띄어쓰기·Ⅰ/1 무시) */
const keyOf = (grade: string, subject: string) => `${grade}|${normalizeSubject(subject)}`;

export function comparePlan(wb: ParsedWorkbook, entries: TimetableEntry[], grades: string[]): ImportPlan {
  const replaced = new Set(grades);
  const pool = wb.plan.filter((p) => replaced.has(p.grade)).map((p) => ({ p, used: false }));
  const rows: ImportRow[] = [];

  for (const e of entries) {
    const k = keyOf(e.grade, e.subject);
    // 같은 과목이 여러 번이면 날짜·교시가 같은 행을 먼저 짝짓는다
    const cands = pool.filter((x) => !x.used && keyOf(x.p.grade, x.p.subject) === k);
    const match = cands.find((x) => x.p.dateStr === e.dateStr && x.p.period === e.period) ?? cands[0];
    const sheet = wb.grades.find((g) => g.grade === e.grade);
    const noColumn = !sheet || !findSubjectColumn(sheet.headers, e.subject);
    if (!match) {
      rows.push({ status: 'added', grade: e.grade, subject: e.subject, entry: e, changes: [], noColumn });
      continue;
    }
    match.used = true;
    const next = toPlanRow(e);
    // 과목명은 띄어쓰기·로마 숫자 차이(확률과 통계 ↔ 확률과통계, 미적분Ⅰ ↔ 미적분1)는 같은 것으로 본다
    const differs = (k: keyof PlanRow) =>
      k === 'subject' ? normalizeSubject(match.p.subject) !== normalizeSubject(next.subject) : String(match.p[k]) !== String(next[k]);
    const changes = FIELDS.filter((f) => differs(f.key)).map(
      (f) => `${f.label}: ${String(match.p[f.key]) || '(빈칸)'} → ${String(next[f.key]) || '(빈칸)'}`,
    );
    rows.push({ status: changes.length ? 'changed' : 'same', grade: e.grade, subject: e.subject, entry: e, current: match.p, changes, noColumn });
  }
  for (const x of pool.filter((x) => !x.used)) {
    rows.push({ status: 'removed', grade: x.p.grade, subject: x.p.subject, current: x.p, changes: [], noColumn: false });
  }

  const merged = [...wb.plan.filter((p) => !replaced.has(p.grade)), ...entries.map(toPlanRow)]
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.grade.localeCompare(b.grade) || a.period - b.period)
    .map((p, i) => ({ ...p, row: i + 2 }));

  const order: Record<ImportStatus, number> = { removed: 0, added: 1, changed: 2, same: 3 };
  rows.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.entry?.dateStr ?? a.current?.dateStr ?? '').localeCompare(b.entry?.dateStr ?? b.current?.dateStr ?? '') ||
      a.grade.localeCompare(b.grade),
  );
  const counts = { same: 0, changed: 0, added: 0, removed: 0 } as Record<ImportStatus, number>;
  rows.forEach((r) => counts[r.status]++);
  return { rows, merged, counts };
}
