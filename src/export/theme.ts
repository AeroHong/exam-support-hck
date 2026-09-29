// 현황표 색상 토큰 — 인쇄(roomSheet.css), XLSX, Google 시트가 같은 값을 쓴다.
// 글자는 모두 검정(인쇄 가독성), 배경색·선으로만 구역을 나눈다.
export const SHEET_COLORS = {
  ink: '000000', // 모든 글자
  accent: '2E6B4F', // 제목 아래 구분선
  lineStrong: '3A4540', // 표 바깥선
  lineSoft: 'C9D3CD', // 표 안쪽선
  headBg: 'E6F0EA', // 고사 정보 머리글
  listHeadBg: 'F5EEE3', // 명단 머리글
  sumHeadBg: 'E3F1EE', // 요약표 머리글·구분 칸
  zebra: 'F7F9F8', // 명단 짝수 행
  provisional: 'A9B2AD', // 결시에 따라 바뀌는 값(응시1교실 인원수)
} as const;

export const SHEET_FONT = 'Malgun Gothic';

/**
 * 학년별 색 — 현황표를 보자마자 학년이 구분되도록 머리글 배경·제목 줄·학년 배지 색을 바꾼다.
 * 1학년 초록 · 2학년 파랑 · 3학년 주황 (서로 가장 멀리 떨어진 색, 글자는 모두 검정 유지)
 */
export interface GradeTheme {
  name: string;
  accent: string; // 제목 아래 줄·학년 배지 테두리
  headBg: string; // 고사 정보 머리글
  listHeadBg: string; // 명단 머리글 (조금 더 진하게)
  sumHeadBg: string; // 요약표 머리글·구분 칸
  badgeBg: string; // 학년 배지 배경
}

export const GRADE_THEMES: Record<string, GradeTheme> = {
  '1학년': { name: '초록', accent: '2E7D4F', headBg: 'DDF0E3', listHeadBg: 'C9E7D3', sumHeadBg: 'DDF0E3', badgeBg: 'C9E7D3' },
  '2학년': { name: '파랑', accent: '1F5FA8', headBg: 'DCE8F7', listHeadBg: 'C7DAF2', sumHeadBg: 'DCE8F7', badgeBg: 'C7DAF2' },
  '3학년': { name: '주황', accent: 'C25A12', headBg: 'FCE6D4', listHeadBg: 'F8D2B3', sumHeadBg: 'FCE6D4', badgeBg: 'F8D2B3' },
};

/** 학년 색 (3개 학년 밖이면 기본 색) */
export function gradeTheme(grade: string): GradeTheme {
  return (
    GRADE_THEMES[grade] ?? {
      name: '기본',
      accent: SHEET_COLORS.accent,
      headBg: SHEET_COLORS.headBg,
      listHeadBg: SHEET_COLORS.listHeadBg,
      sumHeadBg: SHEET_COLORS.sumHeadBg,
      badgeBg: SHEET_COLORS.headBg,
    }
  );
}
