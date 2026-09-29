// 현황표 색상 토큰 — 인쇄(roomSheet.css), XLSX, Google 시트가 같은 값을 쓴다.
export const SHEET_COLORS = {
  ink: '1F2A24', // 본문 글자
  muted: '6B7770', // 보조 글자
  accent: '2E6B4F', // 제목 강조·구분선
  lineStrong: '3A4540', // 표 바깥선
  lineSoft: 'C9D3CD', // 표 안쪽선
  headBg: 'E6F0EA', // 고사 정보 머리글
  headInk: '24503A',
  listHeadBg: 'F5EEE3', // 명단 머리글
  listHeadInk: '5B4A36',
  sumHeadBg: 'E3F1EE', // 요약표 머리글·구분 칸
  sumHeadInk: '1F5A4E',
  zebra: 'F7F9F8', // 명단 짝수 행
  provisional: 'A9B2AD', // 결시에 따라 바뀌는 값(응시1교실 인원수)
} as const;

export const SHEET_FONT = 'Malgun Gothic';
