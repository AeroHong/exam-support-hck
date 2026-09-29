import type { Issue, ParsedWorkbook, SubjectRoster } from './types';
import { normalizeSubject, makeHakbeon } from './subject';
import { subjectKeyOf } from './buildRosters';

const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/;

/** 시험 계획 자체의 문제(중복 과목, 시간 오류) */
export function validatePlan(wb: ParsedWorkbook): Issue[] {
  const issues: Issue[] = [];
  const bySubject = new Map<string, string[]>();
  const firstRow = new Map<string, number>();

  for (const [i, p] of wb.plan.entries()) {
    const subjectKey = subjectKeyOf(p);
    const link = { kind: 'plan' as const, row: i };
    const label = `${p.dateStr} ${p.period}교시 ${p.grade} ${p.subject}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateStr)) {
      issues.push({ level: 'warn', subjectKey, link, message: `[${label}] 날짜 형식을 알 수 없습니다: '${p.dateStr}' (${p.row}행)` });
    }

    const k = `${p.grade}|${normalizeSubject(p.subject)}`;
    bySubject.set(k, [...(bySubject.get(k) ?? []), `${p.dateStr} ${p.period}교시(${p.row}행, 코드 ${p.code})`]);
    firstRow.set(k, firstRow.get(k) ?? i);

    const m = p.timeRange.match(TIME_RANGE);
    if (!m) {
      issues.push({ level: 'warn', subjectKey, link, message: `[${label}] 시험시간 형식을 알 수 없습니다: '${p.timeRange}'` });
      continue;
    }
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (end <= start) {
      issues.push({ level: 'warn', subjectKey, link, message: `[${label}] 시험 종료시각이 시작시각보다 빠릅니다: ${p.timeRange}` });
      continue;
    }
    const minutes = parseInt(p.minutes, 10);
    if (!Number.isNaN(minutes) && minutes !== end - start && !/자습/.test(p.minutes)) {
      issues.push({ level: 'warn', subjectKey, link, message: `[${label}] 시험시간 ${p.timeRange}(${end - start}분)과 시험시간(분) ${p.minutes}이 다릅니다.` });
    }
  }

  for (const [k, where] of bySubject) {
    if (where.length > 1) {
      const [grade, subject] = k.split('|');
      issues.push({ level: 'warn', link: { kind: 'plan', row: firstRow.get(k)! }, message: `[${grade} ${subject}] 시험 계획에 ${where.length}번 있습니다: ${where.join(' / ')}` });
    }
  }
  return issues;
}

/** 같은 날짜·교시에 한 학생이 두 과목 이상 배정된 경우 */
export function findConflicts(rosters: SubjectRoster[]): Issue[] {
  const slots = new Map<string, { grade: string; students: Map<string, { hakbeon: string; subjects: string[] }> }>();
  for (const r of rosters) {
    if (r.skipped) continue;
    const slot = `${r.dateStr} ${r.period}교시 ${r.grade}`;
    const entry = slots.get(slot) ?? { grade: r.grade, students: new Map() };
    slots.set(slot, entry);
    // 대기실은 시험을 보지 않고 기다리는 곳이므로 충돌에서 제외
    for (const sh of r.sheets.filter((x) => x.kind !== 'waiting')) {
      for (const s of sh.main) {
        const hakbeon = makeHakbeon(s.grade, s.ban, s.num);
        const id = `${hakbeon} ${s.name}`;
        const cur = entry.students.get(id) ?? { hakbeon, subjects: [] };
        cur.subjects.push(r.subject);
        entry.students.set(id, cur);
      }
    }
  }
  const issues: Issue[] = [];
  for (const [slot, { grade, students }] of slots) {
    const dup = [...students].filter(([, v]) => new Set(v.subjects).size > 1);
    if (dup.length > 0) {
      const sample = dup.slice(0, 5).map(([id, v]) => `${id}(${[...new Set(v.subjects)].join('·')})`);
      const [, first] = dup[0];
      issues.push({
        level: 'warn',
        link: { kind: 'cell', grade, subject: first.subjects[0], hakbeon: first.hakbeon },
        message: `[${slot}] ${dup.length}명이 두 과목에 배정되어 있습니다: ${sample.join(', ')}${dup.length > 5 ? ' …' : ''}`,
      });
    }
  }
  return issues;
}
