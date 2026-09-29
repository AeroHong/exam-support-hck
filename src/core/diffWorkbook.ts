// 저장 전후 비교 — 활동 기록에 "무엇이 바뀌었는지"를 사람이 읽을 수 있게 남긴다.
import type { ParsedWorkbook, PlanRow, VacancyItem } from './types';
import { cellText } from './editWorkbook';
import { makeHakbeon } from './subject';

export interface WorkbookDiff {
  count: number; // 전체 변경 건수
  summary: string; // 한 줄 요약 (예: "시험 계획 2건, 1학년 명렬 5칸")
  lines: string[]; // 상세 (최대 MAX_LINES)
}

const MAX_LINES = 300;
const PLAN_FIELDS: { key: keyof PlanRow; label: string }[] = [
  { key: 'dateStr', label: '날짜' },
  { key: 'period', label: '교시' },
  { key: 'grade', label: '학년' },
  { key: 'subject', label: '과목' },
  { key: 'code', label: '코드' },
  { key: 'timeRange', label: '시간' },
  { key: 'minutes', label: '시간(분)' },
];

const planLabel = (p: PlanRow) => `${p.dateStr} ${p.period}교시 ${p.grade} ${p.subject || '(과목 없음)'}`;
const show = (v: string) => (v === '' ? '(빈칸)' : v);

function diffPlan(a: PlanRow[], b: PlanRow[], out: string[]): number {
  let n = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    if (x && !y) {
      out.push(`[시험 계획] 삭제: ${planLabel(x)}`);
      n++;
    } else if (!x && y) {
      out.push(`[시험 계획] 추가: ${planLabel(y)}`);
      n++;
    } else if (x && y) {
      const changed = PLAN_FIELDS.filter((f) => String(x[f.key]) !== String(y[f.key]));
      if (changed.length) {
        out.push(`[시험 계획] ${planLabel(x)} — ${changed.map((f) => `${f.label}: ${show(String(x[f.key]))} → ${show(String(y[f.key]))}`).join(', ')}`);
        n++;
      }
    }
  }
  return n;
}

export function diffWorkbook(
  prev: ParsedWorkbook | null,
  next: ParsedWorkbook,
  opts: { prevTitle?: string; nextTitle?: string; prevVacancies?: VacancyItem[]; nextVacancies?: VacancyItem[] } = {},
): WorkbookDiff {
  const lines: string[] = [];
  const parts: string[] = [];

  if (opts.prevTitle !== undefined && opts.nextTitle !== undefined && opts.prevTitle !== opts.nextTitle) {
    lines.push(`[시험 이름] ${opts.prevTitle} → ${opts.nextTitle}`);
    parts.push('시험 이름');
  }

  if (!prev) {
    const students = next.grades.reduce((s, g) => s + g.students.length, 0);
    return {
      count: 1,
      summary: `새 자료 (시험 ${next.plan.length}건, 학생 ${students}명)`,
      lines: [...lines, `시험 계획 ${next.plan.length}건, ${next.grades.map((g) => `${g.grade} ${g.students.length}명`).join(', ')}`],
    };
  }

  const planN = diffPlan(prev.plan, next.plan, lines);
  if (planN) parts.push(`시험 계획 ${planN}건`);

  for (const g of next.grades) {
    const old = prev.grades.find((x) => x.grade === g.grade);
    if (!old) {
      lines.push(`[${g.grade}] 학년 시트 추가 (${g.students.length}명)`);
      parts.push(`${g.grade} 추가`);
      continue;
    }
    let cells = 0;
    let people = 0;
    for (const h of g.headers.filter((h) => !old.headers.includes(h))) {
      lines.push(`[${g.grade}] 과목 열 추가: ${h}`);
      people++;
    }
    for (const h of old.headers.filter((h) => !g.headers.includes(h))) {
      lines.push(`[${g.grade}] 과목 열 삭제: ${h}`);
      people++;
    }

    // 학생 추가·삭제로 배열 순서가 바뀌므로 (반·번호·이름)으로 맞춘다. 이름·반·번호를 고치면 삭제+추가로 보인다.
    const key = (s: { ban: number; num: number; name: string }) => `${s.ban}-${s.num}-${s.name}`;
    const oldMap = new Map(old.students.map((s) => [key(s), s]));
    const newMap = new Map(g.students.map((s) => [key(s), s]));
    for (const [k, s] of newMap) {
      const o = oldMap.get(k);
      const who = `${makeHakbeon(g.grade, s.ban, s.num)} ${s.name}`;
      if (!o) {
        lines.push(`[${g.grade}] 학생 추가/변경: ${who} (${s.gender})`);
        people++;
        continue;
      }
      if (o.gender !== s.gender) {
        lines.push(`[${g.grade}] ${who} 성별: ${o.gender} → ${s.gender}`);
        cells++;
      }
      for (const h of g.headers) {
        if (!old.headers.includes(h)) continue;
        const before = cellText(o.cells[h] ?? null);
        const after = cellText(s.cells[h] ?? null);
        if (before !== after) {
          lines.push(`[${g.grade}] ${who} · ${h}: ${show(before)} → ${show(after)}`);
          cells++;
        }
      }
    }
    for (const [k, s] of oldMap) {
      if (!newMap.has(k)) {
        lines.push(`[${g.grade}] 학생 삭제/변경 전: ${makeHakbeon(g.grade, s.ban, s.num)} ${s.name}`);
        people++;
      }
    }
    if (cells || people) parts.push(`${g.grade} ${[cells && `${cells}칸`, people && `${people}건`].filter(Boolean).join(' ')}`);
  }

  if (opts.prevVacancies && opts.nextVacancies) {
    const a = new Map(opts.prevVacancies.map((v) => [v.hakbeon, v.type]));
    const b = new Map(opts.nextVacancies.map((v) => [v.hakbeon, v.type]));
    let n = 0;
    for (const [h, t] of b) {
      if (!a.has(h)) lines.push(`[결번] 추가: ${h} (${t})`);
      else if (a.get(h) !== t) lines.push(`[결번] ${h}: ${a.get(h)} → ${t}`);
      else continue;
      n++;
    }
    for (const [h, t] of a) {
      if (!b.has(h)) {
        lines.push(`[결번] 삭제: ${h} (${t})`);
        n++;
      }
    }
    if (n) parts.push(`결번 ${n}건`);
  }

  const count = lines.length;
  return {
    count,
    summary: parts.length ? parts.join(', ') : '변경 없음',
    lines: count > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… 외 ${count - MAX_LINES}건`] : lines,
  };
}
