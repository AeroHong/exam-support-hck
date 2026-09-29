// 한글(hwpx) 시험 시간표 → 시험 계획 행
// hwpx = ZIP 안의 Contents/section0.xml. 표는 hp:tbl, 칸은 hp:tc(cellAddr 행·열, cellSpan 병합), 글자는 hp:t.
// 양식: [날짜 | 교시 | N학년(과목명·코드·시험시간) | M학년(…)] 표 + 날짜 칸 없이 교시만 있는 학년 표(앞 표와 교시 순서로 맞물림)
import type { PlanRow } from './types';

/** 태그 이름 비교 — 네임스페이스 처리가 환경마다 달라 "hp:tbl"·"tbl" 모두 받는다 */
const isTag = (el: Element, name: string) => el.localName === name || el.nodeName === `hp:${name}` || el.nodeName.endsWith(`:${name}`);
const descendants = (el: Element | Document, name: string) => Array.from(el.getElementsByTagName('*')).filter((e) => isTag(e, name));
const firstChildTag = (el: Element, name: string) => descendants(el, name)[0];

export interface TCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  lines: string[]; // 문단별 글자
}

export interface TTable {
  rows: number;
  cols: number;
  cells: TCell[];
}

/** 칸이 속한 가장 가까운 표 */
function ownerTable(el: Element): Element | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (isTag(p, 'tbl')) return p;
  return null;
}

/** section XML → 표 목록 (DOMParser는 브라우저 것, 테스트는 happy-dom) */
export function extractTables(xml: string, parser: DOMParser): TTable[] {
  const doc = parser.parseFromString(xml, 'application/xml');
  const tables: TTable[] = [];
  for (const tbl of descendants(doc, 'tbl')) {
    const cells: TCell[] = [];
    for (const tc of descendants(tbl, 'tc')) {
      if (ownerTable(tc) !== tbl) continue; // 표 안의 표 칸은 건너뜀
      const addr = firstChildTag(tc, 'cellAddr');
      const span = firstChildTag(tc, 'cellSpan');
      if (!addr) continue;
      const lines = descendants(tc, 'p')
        .map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join('').trim())
        .filter(Boolean);
      cells.push({
        row: Number(addr.getAttribute('rowAddr')),
        col: Number(addr.getAttribute('colAddr')),
        rowSpan: Number(span?.getAttribute('rowSpan') ?? 1),
        colSpan: Number(span?.getAttribute('colSpan') ?? 1),
        lines,
      });
    }
    tables.push({ rows: Number(tbl.getAttribute('rowCnt')), cols: Number(tbl.getAttribute('colCnt')), cells });
  }
  return tables;
}

/** 시간표에서 읽은 시험 한 건 (시험 계획 행 + 참고 정보) */
export interface TimetableEntry extends Omit<PlanRow, 'row'> {
  essay: boolean; // 서답형 표시(한글 특수 기호)가 있던 과목
  scope: string; // "(1~7반)", "(1,교과3)" 같은 응시 범위 메모
  source: string; // 원문 (확인용)
}

export interface TimetableResult {
  entries: TimetableEntry[];
  grades: string[]; // 시간표에 들어 있는 학년
  issues: string[];
}

const PUA = /[-]|[\u{F0000}-\u{FFFFD}]|[\u{100000}-\u{10FFFD}]/gu; // 한글 문서의 특수 기호(서답형 표시 등)
const squash = (s: string) => s.replace(/\s+/g, '');

/** (행, 열)을 덮는 칸 (병합 칸이면 시작 칸) */
function grid(t: TTable) {
  const at = new Map<string, TCell>();
  for (const c of t.cells) {
    for (let r = c.row; r < c.row + c.rowSpan; r++) for (let k = c.col; k < c.col + c.colSpan; k++) at.set(`${r},${k}`, c);
  }
  return (r: number, c: number) => at.get(`${r},${c}`);
}

interface GradeCols {
  grade: string;
  subject: number;
  code: number;
  time: number;
}

/** 머리글: "N학년"(여러 열 병합) 아래 줄의 과목명·코드·시험시간 열을 찾는다 */
function findHeader(t: TTable) {
  const at = grid(t);
  const gradeCells = t.cells.filter((c) => /^\d학년$/.test(squash(c.lines.join(''))));
  if (gradeCells.length === 0) return null;
  const groups: GradeCols[] = [];
  let dataStart = 0;
  for (const g of gradeCells) {
    const sub = g.row + g.rowSpan;
    const cols = { subject: -1, code: -1, time: -1 };
    for (let k = g.col; k < g.col + g.colSpan; k++) {
      const h = squash(at(sub, k)?.lines.join('') ?? '');
      if (h.includes('과목')) cols.subject = k;
      else if (h.includes('코드')) cols.code = k;
      else if (h.includes('시험시간') || h.includes('시간')) cols.time = k;
    }
    if (cols.subject < 0) continue;
    groups.push({ grade: squash(g.lines.join('')), ...cols });
    dataStart = Math.max(dataStart, sub + 1);
  }
  const headerCell = (word: string) => t.cells.find((c) => c.row < dataStart && squash(c.lines.join('')) === word);
  return { groups, dataStart, dateCol: headerCell('날짜')?.col ?? -1, periodCol: headerCell('교시')?.col ?? -1 };
}

function parseDate(lines: string[], year: number): string | null {
  const m = lines.join(' ').match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\./);
  return m ? `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

function parseEntry(
  lines: { subject: string[]; code: string[]; time: string[] },
  base: { dateStr: string; period: number; grade: string },
): TimetableEntry | null {
  const raw = lines.subject.join(' ');
  const essay = PUA.test(raw);
  PUA.lastIndex = 0;
  const cleaned = lines.subject.map((l) => l.replace(PUA, '').trim()).filter(Boolean);
  // 괄호로 시작하는 줄은 응시 범위 메모, 나머지는 과목명(두 줄로 나뉘었으면 이어 붙임)
  const subject = cleaned.filter((l) => !l.startsWith('(')).join('').replace(/\s+/g, '');
  if (!subject) return null;
  const scope = cleaned.filter((l) => l.startsWith('(')).join(' ');
  const codeRaw = lines.code.join('').replace(/\s/g, '');
  const code = /^\d+$/.test(codeRaw) ? String(Number(codeRaw)) : codeRaw;
  const timeText = lines.time.join(' ');
  const range = timeText.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
  const mins = timeText.match(/\((\d+)\s*분\)/);
  const selfStudy = timeText.match(/\((\d+)\s*분\s*자습\)/);
  return {
    ...base,
    subject,
    code,
    timeRange: range ? `${range[1]}~${range[2]}` : '',
    minutes: mins ? (selfStudy ? `${mins[1]} (${selfStudy[1]}분 자습)` : mins[1]) : '',
    essay,
    scope,
    source: [raw, codeRaw, timeText].filter(Boolean).join(' | '),
  };
}

/**
 * 표 목록 → 시험 계획.
 * 날짜 칸이 있는 표에서 (날짜, 교시) 순서를 만들고, 날짜 칸이 없는 학년 표는 그 순서대로 맞춘다.
 */
export function parseTimetable(tables: TTable[], year: number): TimetableResult {
  const entries: TimetableEntry[] = [];
  const issues: string[] = [];
  const slots: { dateStr: string; period: number }[] = [];
  const parsed = tables.map((t) => ({ t, h: findHeader(t) })).filter((x) => x.h && x.h.groups.length > 0);
  if (parsed.length === 0) {
    return { entries, grades: [], issues: ["시간표 표를 찾지 못했습니다. 'N학년' 아래에 '과목명·코드·시험시간' 칸이 있는 표가 필요합니다."] };
  }

  const read = (t: TTable, h: NonNullable<ReturnType<typeof findHeader>>, r: number, slot: { dateStr: string; period: number }) => {
    const at = grid(t);
    for (const g of h.groups) {
      const s = at(r, g.subject);
      if (!s || s.row !== r || s.lines.length === 0) continue; // 병합으로 이어진 칸·빈칸
      const e = parseEntry(
        { subject: s.lines, code: g.code >= 0 ? (at(r, g.code)?.lines ?? []) : [], time: g.time >= 0 ? (at(r, g.time)?.lines ?? []) : [] },
        { ...slot, grade: g.grade },
      );
      if (e) entries.push(e);
    }
  };

  // ① 날짜 칸이 있는 표: (날짜, 교시) 순서를 만들며 읽는다
  for (const { t, h } of parsed.filter((x) => x.h!.dateCol >= 0)) {
    const at = grid(t);
    for (let r = h!.dataStart; r < t.rows; r++) {
      const d = at(r, h!.dateCol);
      const p = at(r, h!.periodCol);
      const dateStr = d ? parseDate(d.lines, year) : null;
      const period = Number(squash(p?.lines.join('') ?? '')) || 0;
      if (!dateStr) continue;
      if (p && p.row === r) slots.push({ dateStr, period });
      read(t, h!, r, { dateStr, period });
    }
  }

  // ② 날짜 칸이 없는 학년 표: 교시 줄 순서를 ①의 순서에 맞춘다
  for (const { t, h } of parsed.filter((x) => x.h!.dateCol < 0)) {
    const at = grid(t);
    const periodRows: number[] = [];
    for (let r = h!.dataStart; r < t.rows; r++) {
      const p = h!.periodCol >= 0 ? at(r, h!.periodCol) : at(r, 0);
      if (p && p.row === r) periodRows.push(r);
    }
    const label = h!.groups.map((g) => g.grade).join('·');
    if (periodRows.length !== slots.length) {
      issues.push(`${label} 표의 교시 줄 수(${periodRows.length})가 날짜 표의 교시 수(${slots.length})와 달라 날짜를 맞추지 못했을 수 있습니다. 가져온 날짜를 확인하세요.`);
    }
    periodRows.forEach((r, i) => {
      const slot = slots[i];
      if (!slot) return;
      const p = h!.periodCol >= 0 ? at(r, h!.periodCol) : undefined;
      const own = Number(squash(p?.lines.join('') ?? ''));
      if (own && own !== slot.period) {
        issues.push(`${label} 표 ${r + 1}번째 줄의 교시(${own})가 같은 순서의 날짜 표 교시(${slot.dateStr} ${slot.period}교시)와 다릅니다.`);
      }
      read(t, h!, r, { dateStr: slot.dateStr, period: own || slot.period });
    });
  }

  for (const e of entries) {
    if (!e.timeRange) issues.push(`${e.dateStr} ${e.period}교시 ${e.grade} ${e.subject}: 시험시간을 읽지 못했습니다(${e.source}).`);
    if (!e.code) issues.push(`${e.dateStr} ${e.period}교시 ${e.grade} ${e.subject}: 과목코드가 비어 있습니다.`);
  }
  const grades = [...new Set(entries.map((e) => e.grade))].sort();
  entries.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.grade.localeCompare(b.grade) || a.period - b.period);
  return { entries, grades, issues };
}
