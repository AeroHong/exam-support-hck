import type { CellValue, ParsedCell, RoomRules } from './types';
import { DEFAULT_RULES } from './types';

const NORMAL_ROOM = /^\d+-\d+$/;
const SUBJECT_ROOM = /^교과\d+$/;

function clean(s: string): string {
  return s.replace(/★/g, '').replace(/[()（）]/g, '').trim();
}

/**
 * 응시현황 셀 값 → 고사실 배정 정보. 빈칸·제외 대상이면 null.
 *   "1-1"          → normal 1-1
 *   {2,7}(날짜)    → normal 2-7 (엑셀이 "2-7"을 날짜로 바꾼 경우)
 *   "교과3"        → normal 교과3
 *   "도움실/1-1"   → doum, owner 1-1
 *   "도움실"       → doum, owner null (호출측에서 본인 학급으로 추정)
 *   "★교과2★/1-6" → separate 교과2, owner 1-6
 *   "(대기실)"     → waiting 대기실
 *   "★하교"        → null
 *   "도움실/?"     → unknownOwner
 */
export function parseRoomCell(val: CellValue, rules: RoomRules = DEFAULT_RULES): ParsedCell | null {
  if (val === null || val === undefined) return null;

  if (typeof val === 'object') {
    const room = `${val.month}-${val.day}`;
    return { kind: 'normal', room, owner: null, raw: room, fromDate: true };
  }

  const raw = String(val).trim();
  if (raw === '') return null;
  if (rules.excludedKeywords.some((k) => raw.includes(k))) return null;

  const starred = raw.includes('★');
  const [roomPart, ownerPart] = raw.includes('/') ? raw.split('/', 2) : [raw, undefined];
  const room = clean(roomPart);
  const owner = ownerPart === undefined ? null : clean(ownerPart);

  if (owner !== null && (owner === '?' || owner === '')) {
    return { kind: 'unknownOwner', room, owner, raw };
  }
  if (rules.waitingRooms.includes(room)) {
    return { kind: 'waiting', room, owner: null, raw };
  }
  if (room === '도움실') {
    return { kind: 'doum', room, owner, raw };
  }
  if (NORMAL_ROOM.test(room)) {
    return { kind: 'normal', room, owner: null, raw };
  }
  if (SUBJECT_ROOM.test(room)) {
    // 별표 또는 소속 표기가 있으면 별도 고사실, 아니면 일반 고사실
    if (starred || owner !== null) return { kind: 'separate', room, owner, raw };
    return { kind: 'normal', room, owner: null, raw };
  }
  return { kind: 'unrecognized', room, owner, raw };
}
