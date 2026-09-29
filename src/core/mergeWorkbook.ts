// 3-way 병합 — 같은 시험 자료를 여러 사람이 동시에 고쳤을 때 서로의 변경을 살린다.
//   base   : 내가 열었던 저장본
//   mine   : 내가 고친 현재 상태
//   theirs : 그사이 다른 사람이 저장한 최신본
// 원칙: 한쪽만 바꾼 곳은 그 변경을 쓰고, 둘 다 다르게 바꾼 곳은 최신본(theirs)을 두고 충돌로 알린다.
import type { CellValue, GradeSheet, ParsedWorkbook, PlanRow, Student, VacancyItem } from './types';
import { cellText } from './editWorkbook';
import { makeHakbeon } from './subject';

export interface MergeInput {
  workbook: ParsedWorkbook;
  title: string;
  vacancies: VacancyItem[];
}

export interface MergeResult extends MergeInput {
  applied: number; // 최신본 위에 다시 적용한 내 변경 수
  conflicts: string[]; // 둘 다 바꿔서 최신본을 남긴 곳
}

type GStudent = GradeSheet['students'][number];
const skey = (s: Pick<Student, 'ban' | 'num' | 'name'>) => `${s.ban}-${s.num}-${s.name}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const planKey = (p: PlanRow) => `${p.dateStr}|${p.period}|${p.grade}|${p.subject}|${p.code}|${p.timeRange}|${p.minutes}`;
const planLabel = (p: PlanRow) => `${p.dateStr} ${p.period}교시 ${p.grade} ${p.subject}`;

/** 값 하나의 3-way 결정 */
function pick<T>(base: T, mine: T, theirs: T, onConflict: () => void): { value: T; applied: boolean } {
  if (same(mine, base)) return { value: theirs, applied: false }; // 나는 안 바꿈
  if (same(theirs, base) || same(theirs, mine)) return { value: mine, applied: !same(theirs, mine) }; // 나만 바꿈(또는 같게 바꿈)
  onConflict();
  return { value: theirs, applied: false };
}

function mergePlan(base: PlanRow[], mine: PlanRow[], theirs: PlanRow[], conflicts: string[]): { plan: PlanRow[]; applied: number } {
  // 시험 계획은 행 전체를 단위로: 내가 추가한 행은 더하고, 내가 지운 행은 (최신본에 그대로 있으면) 지운다.
  // 내가 고친 행 = 지운 행 + 추가한 행으로 본다.
  const b = new Set(base.map(planKey));
  const m = new Set(mine.map(planKey));
  const added = mine.filter((p) => !b.has(planKey(p)));
  const removed = new Set(base.filter((p) => !m.has(planKey(p))).map(planKey));
  let applied = 0;
  const out: PlanRow[] = [];
  for (const p of theirs) {
    if (removed.has(planKey(p))) {
      applied++;
      continue;
    }
    out.push(p);
  }
  // 내가 지우려던 행을 상대가 이미 고쳤으면 최신본 쪽이 남는다(자연스럽게 충돌 없이 유지)
  const outKeys = new Set(out.map(planKey));
  for (const p of added) {
    if (outKeys.has(planKey(p))) continue;
    out.push(p);
    applied++;
  }
  // 같은 날짜·교시·학년·과목 행이 두 개가 되면(둘이 같은 행을 다르게 고침) 알린다
  const slot = new Map<string, number>();
  for (const p of out) {
    const k = `${p.dateStr}|${p.period}|${p.grade}|${p.subject}`;
    slot.set(k, (slot.get(k) ?? 0) + 1);
  }
  for (const [k, n] of slot) {
    if (n > 1 && added.some((p) => `${p.dateStr}|${p.period}|${p.grade}|${p.subject}` === k)) {
      const p = out.find((x) => `${x.dateStr}|${x.period}|${x.grade}|${x.subject}` === k)!;
      conflicts.push(`[시험 계획] ${planLabel(p)} — 두 사람이 같은 행을 다르게 고쳐 ${n}줄이 되었습니다. 확인 후 하나를 지우세요.`);
    }
  }
  return { plan: out.map((p, i) => ({ ...p, row: i + 2 })), applied };
}

function mergeGrade(base: GradeSheet | undefined, mine: GradeSheet, theirs: GradeSheet | undefined, conflicts: string[]): { sheet: GradeSheet; applied: number } {
  if (!theirs) return { sheet: mine, applied: 1 };
  if (!base) return { sheet: theirs, applied: 0 };
  let applied = 0;

  // 과목 열: 추가·삭제만 다시 적용
  const addedH = mine.headers.filter((h) => !base.headers.includes(h));
  const removedH = base.headers.filter((h) => !mine.headers.includes(h));
  const headers = [...theirs.headers.filter((h) => !removedH.includes(h)), ...addedH.filter((h) => !theirs.headers.includes(h))];
  applied += addedH.length + removedH.length;

  const bMap = new Map(base.students.map((s) => [skey(s), s]));
  const mMap = new Map(mine.students.map((s) => [skey(s), s]));
  const tMap = new Map(theirs.students.map((s) => [skey(s), s]));

  const students: GStudent[] = [];
  for (const t of theirs.students) {
    const k = skey(t);
    const b = bMap.get(k);
    const m = mMap.get(k);
    if (b && !m) {
      // 내가 지운 학생
      applied++;
      continue;
    }
    if (!b || !m) {
      students.push(t);
      continue;
    }
    const who = `${makeHakbeon(mine.grade, t.ban, t.num)} ${t.name}`;
    const gender = pick(b.gender, m.gender, t.gender, () => conflicts.push(`[${mine.grade}] ${who} 성별 — 두 사람이 다르게 고쳐 최신본(${t.gender})을 남겼습니다.`));
    if (gender.applied) applied++;
    const cells: Record<string, CellValue> = {};
    for (const h of headers) {
      const bv = cellText(b.cells[h] ?? null);
      const mv = cellText(m.cells[h] ?? null);
      const tv = cellText(t.cells[h] ?? null);
      const r = pick(bv, mv, tv, () => conflicts.push(`[${mine.grade}] ${who} · ${h} — 내 값 '${mv || '(빈칸)'}', 최신본 '${tv || '(빈칸)'}' → 최신본을 남겼습니다.`));
      if (r.applied) applied++;
      const src = r.value === tv ? t : r.value === mv ? m : b;
      cells[h] = r.value === '' ? null : (src.cells[h] ?? r.value);
    }
    students.push({ ...t, gender: gender.value, cells });
  }
  // 내가 추가한 학생
  for (const m of mine.students) {
    const k = skey(m);
    if (!bMap.has(k) && !tMap.has(k)) {
      const cells = Object.fromEntries(headers.map((h) => [h, m.cells[h] ?? null])) as Record<string, CellValue>;
      students.push({ ...m, cells });
      applied++;
    }
  }
  students.sort((a, b) => a.ban - b.ban || a.num - b.num);
  return { sheet: { ...theirs, headers, students }, applied };
}

function mergeVacancies(base: VacancyItem[], mine: VacancyItem[], theirs: VacancyItem[]): { items: VacancyItem[]; applied: number } {
  const b = new Map(base.map((v) => [v.hakbeon, v]));
  const m = new Map(mine.map((v) => [v.hakbeon, v]));
  const out = new Map(theirs.map((v) => [v.hakbeon, v]));
  let applied = 0;
  for (const [h, v] of m) {
    if (!same(b.get(h), v)) {
      out.set(h, v);
      applied++;
    }
  }
  for (const h of b.keys()) {
    if (!m.has(h) && out.has(h)) {
      out.delete(h);
      applied++;
    }
  }
  return { items: [...out.values()], applied };
}

/** 최신본(theirs) 위에 내 변경(base → mine)을 다시 적용한다 */
export function mergeWorkbook(base: MergeInput, mine: MergeInput, theirs: MergeInput): MergeResult {
  const conflicts: string[] = [];
  let applied = 0;

  const title = pick(base.title, mine.title, theirs.title, () => conflicts.push(`[시험 이름] 내 값 '${mine.title}', 최신본 '${theirs.title}' → 최신본을 남겼습니다.`));
  if (title.applied) applied++;

  const plan = mergePlan(base.workbook.plan, mine.workbook.plan, theirs.workbook.plan, conflicts);
  applied += plan.applied;

  const grades: GradeSheet[] = [];
  for (const t of theirs.workbook.grades) {
    const m = mine.workbook.grades.find((g) => g.grade === t.grade);
    const b = base.workbook.grades.find((g) => g.grade === t.grade);
    if (!m) {
      grades.push(t);
      continue;
    }
    const r = mergeGrade(b, m, t, conflicts);
    grades.push(r.sheet);
    applied += r.applied;
  }
  for (const m of mine.workbook.grades) {
    if (!theirs.workbook.grades.some((g) => g.grade === m.grade)) {
      grades.push(m);
      applied++;
    }
  }

  const vac = mergeVacancies(base.vacancies, mine.vacancies, theirs.vacancies);
  applied += vac.applied;

  return {
    title: title.value,
    workbook: { plan: plan.plan, grades: grades.sort((a, b) => a.grade.localeCompare(b.grade)) },
    vacancies: vac.items,
    applied,
    conflicts,
  };
}
