import type { ActionType } from '../firebase/activity';

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
