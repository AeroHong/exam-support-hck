import type { GradeSheet, VacancyItem } from './types';
import { makeHakbeon } from './subject';

/** 반별 번호 사이의 빈 번호를 결번 후보로 찾는다 (마지막 번호 뒤 결번은 알 수 없음) */
export function detectVacancies(grades: GradeSheet[]): VacancyItem[] {
  const out: VacancyItem[] = [];
  for (const g of grades) {
    const byBan = new Map<number, Set<number>>();
    for (const s of g.students) {
      const set = byBan.get(s.ban) ?? new Set<number>();
      set.add(s.num);
      byBan.set(s.ban, set);
    }
    for (const [ban, nums] of [...byBan].sort((a, b) => a[0] - b[0])) {
      const max = Math.max(...nums);
      for (let n = 1; n < max; n++) {
        if (!nums.has(n)) out.push({ hakbeon: makeHakbeon(g.grade, ban, n), type: '결번', note: '자동 감지' });
      }
    }
  }
  return out;
}

/** 수동 목록 우선, 자동 감지분은 수동 목록에 없는 것만 추가 */
export function mergeVacancies(manual: VacancyItem[], detected: VacancyItem[]): VacancyItem[] {
  const known = new Set(manual.map((v) => v.hakbeon));
  return [...manual, ...detected.filter((v) => !known.has(v.hakbeon))];
}
