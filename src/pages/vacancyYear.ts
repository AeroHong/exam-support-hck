import type { ParsedWorkbook } from '../core';

/** 결번 목록은 학년도 단위로 저장한다. 시험 계획의 첫 날짜에서 연도를 가져온다. */
export function examYear(wb: ParsedWorkbook | null): string {
  const d = wb?.plan.find((p) => /^\d{4}-/.test(p.dateStr))?.dateStr;
  return d ? d.slice(0, 4) : String(new Date().getFullYear());
}
