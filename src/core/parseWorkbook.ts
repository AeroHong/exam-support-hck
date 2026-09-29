import * as XLSX from 'xlsx';
import type { CellValue, GradeSheet, ParsedWorkbook, PlanRow } from './types';

const GRADE_SHEET = /^\s*(\d)\s*학년.*응시현황/;
const PLAN_SHEET = /시험\s*계획/;

type Cell = XLSX.CellObject | undefined;

function isDateCell(c: Cell): boolean {
  if (!c) return false;
  if (c.t === 'd') return true;
  return c.t === 'n' && typeof c.z === 'string' && XLSX.SSF.is_date(c.z);
}

/** 날짜 셀을 시간대 영향 없이 {y,m,d}로 */
function dateParts(c: XLSX.CellObject): { y: number; m: number; d: number } {
  if (c.v instanceof Date) {
    return { y: c.v.getFullYear(), m: c.v.getMonth() + 1, d: c.v.getDate() };
  }
  const p = XLSX.SSF.parse_date_code(c.v as number);
  return { y: p.y, m: p.m, d: p.d };
}

function text(c: Cell): string {
  if (!c || c.v === undefined || c.v === null) return '';
  return String(c.v).trim();
}

function cellAt(ws: XLSX.WorkSheet, r: number, col: number): Cell {
  return ws[XLSX.utils.encode_cell({ r, c: col })] as Cell;
}

function toCellValue(c: Cell): CellValue {
  if (!c || c.v === undefined || c.v === null || c.v === '') return null;
  if (isDateCell(c)) {
    const { m, d } = dateParts(c);
    return { month: m, day: d };
  }
  const s = String(c.v).trim();
  return s === '' ? null : s;
}

function parseGradeSheet(ws: XLSX.WorkSheet, grade: string): GradeSheet {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const headerCols: { col: number; name: string }[] = [];
  for (let col = 4; col <= range.e.c; col++) {
    const name = text(cellAt(ws, 0, col)).replace(/\s*\n\s*/g, '');
    if (name) headerCols.push({ col, name });
  }

  const students: GradeSheet['students'] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const name = text(cellAt(ws, r, 2));
    const ban = Number(text(cellAt(ws, r, 0)));
    const num = Number(text(cellAt(ws, r, 1)));
    if (!name || !ban || !num) continue;
    const cells: Record<string, CellValue> = {};
    for (const h of headerCols) cells[h.name] = toCellValue(cellAt(ws, r, h.col));
    students.push({ grade, ban, num, name, gender: text(cellAt(ws, r, 3)), cells });
  }
  return { grade, headers: headerCols.map((h) => h.name), students };
}

function formatDate(c: Cell): string {
  if (!c) return '';
  if (isDateCell(c)) {
    const { y, m, d } = dateParts(c);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return text(c);
}

function parsePlanSheet(ws: XLSX.WorkSheet): PlanRow[] {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const rows: PlanRow[] = [];
  for (let r = 1; r <= range.e.r; r++) {
    const subject = text(cellAt(ws, r, 3));
    if (!subject) continue;
    rows.push({
      row: r + 1,
      dateStr: formatDate(cellAt(ws, r, 0)),
      period: Number(text(cellAt(ws, r, 1))) || 0,
      grade: text(cellAt(ws, r, 2)),
      subject,
      code: text(cellAt(ws, r, 4)),
      timeRange: text(cellAt(ws, r, 5)),
      minutes: text(cellAt(ws, r, 6)),
    });
  }
  return rows;
}

export function parseWorkbook(data: ArrayBuffer | Uint8Array): ParsedWorkbook {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, cellNF: true });
  const grades: GradeSheet[] = [];
  let plan: PlanRow[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const g = name.match(GRADE_SHEET);
    if (g) grades.push(parseGradeSheet(ws, `${g[1]}학년`));
    else if (PLAN_SHEET.test(name)) plan = parsePlanSheet(ws);
  }
  if (grades.length === 0) throw new Error("'N학년 응시현황' 시트를 찾을 수 없습니다.");
  if (plan.length === 0) throw new Error("'과목별 시험 계획' 시트를 찾을 수 없거나 비어 있습니다.");

  grades.sort((a, b) => a.grade.localeCompare(b.grade));
  return { grades, plan };
}
