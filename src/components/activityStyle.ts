import type { ActionType, ActivityLog } from '../firebase/activity';

/** 좁은 곳(최근 활동 패널·한 줄 표시)에 쓰는 짧은 활동 이름 */
export const SHORT_ACTION: Record<ActionType, string> = {
  login: '로그인',
  access_denied: '접근 거부',
  exam_create: '업로드',
  exam_replace: '엑셀 교체',
  exam_open: '자료 열기',
  exam_save: '저장',
  exam_restore: '버전 복구',
  exam_delete: '자료 삭제',
  print: '인쇄',
  export_xlsx: 'XLSX',
  export_gsheets: '구글 시트',
  download_source: '엑셀 받기',
  member_add: '사용자 지정',
  member_role: '권한 변경',
  member_remove: '사용자 해제',
};

/** 데이터가 바뀐 저장 — 최근 활동에 세부 수정 내용을 보여주는 활동 */
const DATA_CHANGE: ReadonlySet<ActionType> = new Set<ActionType>(['exam_save', 'exam_restore', 'exam_replace']);

/** 최근 활동에 보일 수정 내용 — 데이터 저장일 때만, 그 외(열기·인쇄 등)는 null */
export function changeDetail(l: Pick<ActivityLog, 'action' | 'summary' | 'details'>): string | null {
  return DATA_CHANGE.has(l.action) ? conciseChange(l) : null;
}

/**
 * 한 줄 요약용 "수정 내용" — 세부 변경 내역이 있으면 첫 줄 + 외 N건, 없으면 요약.
 * 예) "[1학년] 10101 권용준 · 공통국어2: 1-1 → 도움실/1-1 외 3건"
 */
export function conciseChange(l: Pick<ActivityLog, 'summary' | 'details'>): string {
  const d = l.details ?? [];
  if (d.length === 0) return l.summary;
  return d.length > 1 ? `${d[0]} 외 ${d.length - 1}건` : d[0];
}

/** 활동 종류별 칩 색 — 데이터를 바꾸는 활동은 진하게 (활동 기록 화면·최근 활동 패널 공통) */
export const ACTION_COLOR: Partial<Record<ActionType, 'primary' | 'secondary' | 'warning' | 'error' | 'info' | 'success'>> = {
  exam_create: 'primary',
  exam_replace: 'warning',
  exam_save: 'primary',
  exam_delete: 'error',
  print: 'success',
  export_xlsx: 'success',
  export_gsheets: 'success',
  download_source: 'info',
  member_add: 'secondary',
  member_role: 'secondary',
  member_remove: 'error',
  access_denied: 'error',
};

/** "방금", "3분 전", "2시간 전", "어제 14:05", "9/27 14:05" */
export function relativeTime(d: Date | undefined, now = Date.now()): string {
  if (!d) return '방금';
  const sec = Math.floor((now - d.getTime()) / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 6 * 3600) return `${Math.floor(sec / 3600)}시간 전`;
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const today = new Date(now);
  const yesterday = new Date(now - 86400000);
  if (d.toDateString() === today.toDateString()) return `오늘 ${hm}`;
  if (d.toDateString() === yesterday.toDateString()) return `어제 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
