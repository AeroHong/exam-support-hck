// 응시현황 데이터 편집 — 모두 새 객체를 돌려주는 순수 함수 (되돌리기용 스냅숏을 싸게 유지)
import type { CellValue, GradeSheet, ParsedWorkbook, PlanRow, Student } from './types';

export type StudentField = 'ban' | 'num' | 'name' | 'gender';

/** 셀 값 표시용 문자열 (날짜로 바뀐 값은 "2-7") */
export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return `${v.month}-${v.day}`;
  return v;
}

function mapGrade(wb: ParsedWorkbook, grade: string, fn: (g: GradeSheet) => GradeSheet): ParsedWorkbook {
  return { ...wb, grades: wb.grades.map((g) => (g.grade === grade ? fn(g) : g)) };
}

function renumberPlan(plan: PlanRow[]): PlanRow[] {
  return plan.map((p, i) => (p.row === i + 2 ? p : { ...p, row: i + 2 }));
}

export function setRoomCell(wb: ParsedWorkbook, grade: string, index: number, subject: string, text: string): ParsedWorkbook {
  const value: CellValue = text.trim() === '' ? null : text.trim();
  return mapGrade(wb, grade, (g) => ({
    ...g,
    students: g.students.map((s, i) => (i === index ? { ...s, cells: { ...s.cells, [subject]: value } } : s)),
  }));
}

export function setStudentField(wb: ParsedWorkbook, grade: string, index: number, field: StudentField, text: string): ParsedWorkbook {
  const value = field === 'ban' || field === 'num' ? Number(text) || 0 : text.trim();
  return mapGrade(wb, grade, (g) => ({
    ...g,
    students: g.students.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
  }));
}

/** 새 학생 추가 — 반·번호 순서 자리에 끼워 넣는다 */
export function addStudent(wb: ParsedWorkbook, grade: string, student: Pick<Student, 'ban' | 'num' | 'name' | 'gender'>): ParsedWorkbook {
  return mapGrade(wb, grade, (g) => {
    const cells = Object.fromEntries(g.headers.map((h) => [h, null])) as Record<string, CellValue>;
    const row = { grade, ...student, cells };
    const at = g.students.findIndex((s) => s.ban > row.ban || (s.ban === row.ban && s.num > row.num));
    const students = [...g.students];
    students.splice(at === -1 ? students.length : at, 0, row);
    return { ...g, students };
  });
}

export function removeStudent(wb: ParsedWorkbook, grade: string, index: number): ParsedWorkbook {
  return mapGrade(wb, grade, (g) => ({ ...g, students: g.students.filter((_, i) => i !== index) }));
}

export function addSubject(wb: ParsedWorkbook, grade: string, name: string): ParsedWorkbook {
  const subject = name.trim();
  return mapGrade(wb, grade, (g) => {
    if (!subject || g.headers.includes(subject)) return g;
    return {
      ...g,
      headers: [...g.headers, subject],
      students: g.students.map((s) => ({ ...s, cells: { ...s.cells, [subject]: null } })),
    };
  });
}

export function removeSubject(wb: ParsedWorkbook, grade: string, subject: string): ParsedWorkbook {
  return mapGrade(wb, grade, (g) => ({
    ...g,
    headers: g.headers.filter((h) => h !== subject),
    students: g.students.map((s) => {
      const cells = { ...s.cells };
      delete cells[subject];
      return { ...s, cells };
    }),
  }));
}

/** 열 전체에서 값 바꾸기 (예: "2-3" → "교과3"). subject가 null이면 모든 과목 열 */
export function replaceInColumn(
  wb: ParsedWorkbook,
  grade: string,
  subject: string | null,
  from: string,
  to: string,
): { wb: ParsedWorkbook; count: number } {
  let count = 0;
  const next = mapGrade(wb, grade, (g) => ({
    ...g,
    students: g.students.map((s) => {
      let changed = false;
      const cells = { ...s.cells };
      for (const h of subject ? [subject] : g.headers) {
        if (cellText(cells[h]) === from) {
          cells[h] = to.trim() === '' ? null : to.trim();
          changed = true;
          count++;
        }
      }
      return changed ? { ...s, cells } : s;
    }),
  }));
  return { wb: next, count };
}

export function updatePlanRow(wb: ParsedWorkbook, index: number, patch: Partial<Omit<PlanRow, 'row'>>): ParsedWorkbook {
  return { ...wb, plan: wb.plan.map((p, i) => (i === index ? { ...p, ...patch } : p)) };
}

export function addPlanRow(wb: ParsedWorkbook, base?: Partial<PlanRow>): ParsedWorkbook {
  const last = wb.plan[wb.plan.length - 1];
  const row: PlanRow = {
    row: 0,
    dateStr: base?.dateStr ?? last?.dateStr ?? '',
    period: base?.period ?? 1,
    grade: base?.grade ?? last?.grade ?? '1학년',
    subject: base?.subject ?? '',
    code: base?.code ?? '',
    timeRange: base?.timeRange ?? '',
    minutes: base?.minutes ?? '',
  };
  return { ...wb, plan: renumberPlan([...wb.plan, row]) };
}

export function removePlanRow(wb: ParsedWorkbook, index: number): ParsedWorkbook {
  return { ...wb, plan: renumberPlan(wb.plan.filter((_, i) => i !== index)) };
}
