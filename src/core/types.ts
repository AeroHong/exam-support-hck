// 도메인 타입 — React·Firebase에 의존하지 않는다.

export type Grade = '1학년' | '2학년' | '3학년' | string;

export interface Student {
  grade: Grade;
  ban: number;
  num: number;
  name: string;
  gender: string;
}

/** 학년 시트 1개: 과목 열 이름 → 학생별 원본 셀 값 */
export interface GradeSheet {
  grade: Grade;
  headers: string[]; // 과목 열 이름(원본 표기)
  students: (Student & { cells: Record<string, CellValue> })[];
}

/** 엑셀 원본 셀 값. 날짜로 변환된 셀은 {month, day}로 보존한다 */
export type CellValue = string | { month: number; day: number } | null;

export interface PlanRow {
  row: number; // 엑셀 행 번호(검증 메시지용)
  dateStr: string; // yyyy-MM-dd
  period: number;
  grade: Grade;
  subject: string;
  code: string;
  timeRange: string;
  minutes: string;
}

export interface ParsedWorkbook {
  grades: GradeSheet[];
  plan: PlanRow[];
}

export type CellKind = 'normal' | 'doum' | 'separate' | 'waiting' | 'excluded' | 'unknownOwner' | 'unrecognized';

export interface ParsedCell {
  kind: CellKind;
  room: string; // 실제 시험 보는 곳
  owner: string | null; // 소속 고사실 (도움실/별도실만)
  raw: string;
  fromDate?: boolean; // 날짜로 바뀐 값을 복원했는지
}

export type RoomKind = 'normal' | 'doum' | 'separate' | 'waiting';

export interface RoomSheet {
  key: string; // 과목키|고사실
  subjectKey: string;
  dateStr: string;
  period: number;
  grade: Grade;
  subject: string;
  code: string;
  timeRange: string;
  roomName: string;
  kind: RoomKind;
  classes: string[]; // '학급' 칸
  main: Student[]; // 좌석 명단
  doum: Student[]; // 이 고사실 소속 도움실 응시자
  separate: Student[]; // 이 고사실 소속 별도실 응시자
  vacancies: string[]; // 결번 학번
  vocational: string[]; // 결번(직업반) 학번
}

export interface SubjectRoster {
  subjectKey: string;
  dateStr: string;
  period: number;
  grade: Grade;
  subject: string;
  code: string;
  timeRange: string;
  sheets: RoomSheet[];
  skipped: boolean; // '?' 소속 학생 때문에 건너뜀
}

export type IssueLevel = 'error' | 'warn' | 'info';

export interface Issue {
  level: IssueLevel;
  message: string;
  subjectKey?: string;
}

export interface VacancyItem {
  hakbeon: string;
  type: '결번' | '직업반';
  note?: string;
}

export interface RoomRules {
  waitingRooms: string[];
  excludedKeywords: string[];
}

export const DEFAULT_RULES: RoomRules = {
  waitingRooms: ['대기실', '멀티실', '영어교과실', '토의토론실'],
  excludedKeywords: ['하교', '미등교'],
};

export const SEAT_ROWS = 50;
