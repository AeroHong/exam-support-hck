// 과목별 '여분' 표지 — 인쇄·XLSX·Google 시트 공통 값
import type { SubjectRoster } from '../core';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 표지 위쪽 작은 줄: "10/6(화) 1교시 · 08:20~09:10 · 과목코드 22" */
export function spareInfo(r: SubjectRoster): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(r.dateStr) ? new Date(`${r.dateStr}T00:00:00`) : null;
  const date = d ? `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})` : r.dateStr;
  return [`${date} ${r.period}교시`, r.timeRange, r.code ? `과목코드 ${r.code}` : ''].filter(Boolean).join(' · ');
}

/** 과목명 글자 크기(mm) — 폭 170mm 안에 한 줄로, 짧은 과목명은 최대 44mm */
export function spareSubjectSizeMm(subject: string): number {
  const n = Math.max(1, [...subject].length);
  return Math.round(Math.min(44, 168 / (n * 1.04)) * 10) / 10;
}

/** 같은 크기를 pt로 (XLSX·Google 시트) */
export function spareSubjectSizePt(subject: string): number {
  return Math.round(spareSubjectSizeMm(subject) * 2.835);
}

export const SPARE_WORD_PT = 115; // '여분' 글자 크기(pt) ≈ 40mm
export const SPARE_SHEET_NAME = '여분';
