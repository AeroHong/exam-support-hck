import type { RoomSheet, Student } from './types';
import { SEAT_ROWS } from './types';
import { makeHakbeon } from './subject';

export interface SummaryRow {
  label: string;
  count: number | '';
  detail: string; // 학번(이름) 나열
}

export interface SheetSummary {
  title: string;
  dateTime: string; // "2026-10-06\n10:40~11:30"
  subjectLabel: string; // "공통국어2(2)"
  classLabel: string;
  enrolled: number;
  rows: SummaryRow[];
  pages: Student[][]; // 50석 단위로 나눈 좌석 명단
}

export const studentLabel = (s: Student) => `${makeHakbeon(s.grade, s.ban, s.num)} ${s.name}`;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** 현황표 한 장의 머리글·요약표 값 (인쇄·XLSX·구글시트 공통) */
export function summarize(sheet: RoomSheet): SheetSummary {
  const n = sheet.main.length;
  const main = sheet.kind === 'normal' || sheet.kind === 'waiting' ? n : '';
  const doum = sheet.kind === 'doum' ? n : sheet.doum.length;
  const sep = sheet.kind === 'separate' ? n : sheet.separate.length;
  const listOrBlank = (xs: Student[], own: boolean) => (own ? '' : xs.map(studentLabel).join('\n'));

  return {
    title: `${sheet.roomName}  ${sheet.subject}  ${sheet.kind === 'waiting' ? '대기실 현황표' : '응시현황표'}`,
    dateTime: `${sheet.dateStr}\n${sheet.timeRange}`,
    subjectLabel: sheet.code ? `${sheet.subject}(${sheet.code})` : sheet.subject,
    classLabel: sheet.classes.join(', '),
    enrolled: n + sheet.doum.length + sheet.separate.length,
    rows: [
      { label: '응시1교실', count: main, detail: '' },
      { label: '응시2도움실', count: doum, detail: listOrBlank(sheet.doum, sheet.kind === 'doum') },
      { label: '응시3별도실', count: sep, detail: listOrBlank(sheet.separate, sheet.kind === 'separate') },
      { label: '결번', count: sheet.vacancies.length || '', detail: sheet.vacancies.join(', ') },
      { label: '결번(직업반)', count: sheet.vocational.length || '', detail: sheet.vocational.join(', ') },
      { label: '결시', count: '', detail: '' },
    ],
    pages: chunk(sheet.main, SEAT_ROWS),
  };
}
