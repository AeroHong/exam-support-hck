import type { CellValue, ParsedCell, RoomRules } from './types';
import { DEFAULT_RULES } from './types';

const CLASS_ROOM = /^\d+-\d+$/; // 반 번호 (학급 교실)
const SUBJECT_ROOM = /^교과\d+$/; // 교과 교실
const SEPARATE_WORDS = ['별도실', '별도고사실', '별도 고사실']; // "별도실/교과7"처럼 별도 고사실임을 적은 말

function clean(s: string): string {
  return s.replace(/★/g, '').replace(/[()（）]/g, '').trim();
}

/**
 * 응시현황 셀 값 → 고사실 배정 정보. 빈칸·제외 대상이면 null.
 *
 * 표기 규칙: `고사실/소속` — 앞은 실제로 시험 보는 곳, 뒤는 원래 응시할 분반(소속)
 *   "3-7"          → 일반 고사실 3-7
 *   {2,7}(날짜)    → 일반 고사실 2-7 (엑셀이 "2-7"을 날짜로 바꾼 경우)
 *   "교과3"        → 일반 고사실 교과3 (소속 없이 단독이면 여러 명이 보는 고사실로 본다)
 *   "도움실/3-7"   → 도움실 응시, 소속 3-7 (3-7 현황표의 '응시2도움실' + 도움실 현황표)
 *   "교과7/3-5"    → 별도 고사실 교과7, 소속 3-5 (3-5 현황표의 '응시3별도실' + 교과7 현황표)
 *   "도움실"       → 도움실 응시, 소속 없음 → 호출측에서 담임반으로 추정하고 경고
 *   "★교과2★"     → 별도 고사실 교과2 (별표 = 별도 고사실, 예전 표기), 소속 추정
 *   "(대기실)"     → 대기실 현황표
 *   "★하교"        → 제외
 *   "도움실/?"     → 소속 미확인 → 그 과목은 건너뜀
 * 예전·다른 순서 표기도 받는다:
 *   "3-7/도움실"   → 반 번호 쪽을 소속으로 본다 (= 도움실/3-7)
 *   "별도실/교과7" → 별도 고사실 교과7, 소속 추정
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
  let separateWord = false;
  let room: string;
  let owner: string | null = null;

  if (raw.includes('/')) {
    const [a, b] = raw.split('/', 2).map(clean);
    if (a === '' || b === '' || a === '?' || b === '?') {
      return { kind: 'unknownOwner', room: a === '?' || a === '' ? b : a, owner: '?', raw };
    }
    if (SEPARATE_WORDS.includes(a)) {
      room = b; // "별도실/교과7"
      separateWord = true;
    } else if (SEPARATE_WORDS.includes(b)) {
      room = a; // "교과7/별도실"
      separateWord = true;
    } else if (CLASS_ROOM.test(a) && !CLASS_ROOM.test(b)) {
      room = b; // "3-7/도움실" — 반 번호 쪽이 소속
      owner = a;
    } else {
      room = a; // "도움실/3-7", "교과7/3-5" — 기본 표기
      owner = b;
    }
  } else {
    room = clean(raw);
  }

  if (rules.waitingRooms.includes(room)) {
    return { kind: 'waiting', room, owner: null, raw };
  }
  if (room === '도움실') {
    return { kind: 'doum', room, owner, raw };
  }
  if (CLASS_ROOM.test(room)) {
    // 다른 반 교실을 별도 고사실로 쓰는 경우("3-6/3-5")만 별도실, 아니면 일반 고사실
    if (owner && owner !== room) return { kind: 'separate', room, owner, raw };
    return { kind: 'normal', room, owner: null, raw };
  }
  if (SUBJECT_ROOM.test(room) || starred || separateWord || owner !== null) {
    // 소속이 붙었거나(교과7/3-5) 별도실이라고 적었거나 별표면 별도 고사실, 단독 교과실은 일반 고사실
    if (owner !== null || starred || separateWord) return { kind: 'separate', room, owner, raw };
    return { kind: 'normal', room, owner: null, raw };
  }
  return { kind: 'unrecognized', room, owner, raw };
}
