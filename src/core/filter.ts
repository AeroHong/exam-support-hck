import type { RoomSheet, SubjectRoster } from './types';
import { normalizeSubject } from './subject';

export type FilterMode = 'ALL' | 'DATE' | 'GRADE' | 'SUBJECT' | 'ROOM';

export interface RosterFilter {
  mode: FilterMode;
  value: string;
}

/** 사이드바의 전체/날짜/학년/과목/고사실 필터 */
export function filterRosters(rosters: SubjectRoster[], f: RosterFilter): SubjectRoster[] {
  const active = rosters.filter((r) => !r.skipped);
  switch (f.mode) {
    case 'ALL':
      return active;
    case 'DATE':
      return active.filter((r) => r.dateStr === f.value);
    case 'GRADE':
      return active.filter((r) => r.grade === f.value);
    case 'SUBJECT':
      return active.filter((r) => r.subjectKey === f.value || normalizeSubject(r.subject) === normalizeSubject(f.value));
    case 'ROOM': {
      const room = f.value.trim();
      return active
        .map((r) => ({ ...r, sheets: r.sheets.filter((s) => s.roomName === room) }))
        .filter((r) => r.sheets.length > 0);
    }
  }
}

export function allSheets(rosters: SubjectRoster[]): RoomSheet[] {
  return rosters.flatMap((r) => r.sheets);
}
