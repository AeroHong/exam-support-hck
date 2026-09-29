import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addPlanRow,
  addStudent,
  addSubject,
  buildRosters,
  cellText,
  exportWorkbook,
  parseWorkbook,
  removePlanRow,
  removeStudent,
  removeSubject,
  replaceInColumn,
  setRoomCell,
  setStudentField,
  updatePlanRow,
} from './index';

const fixture = resolve(__dirname, '../../fixtures/2026-2-mid.xlsx');

describe.skipIf(!existsSync(fixture))('데이터 편집', () => {
  const wb = parseWorkbook(readFileSync(fixture));
  const sheetOf = (w: typeof wb, grade: string, subject: string, room: string) =>
    buildRosters(w).rosters.find((r) => r.grade === grade && r.subject === subject)!.sheets.find((s) => s.roomName === room);

  it('셀을 바꾸면 현황표에 반영되고 원본은 그대로다', () => {
    const idx = wb.grades[0].students.findIndex((s) => s.ban === 1 && s.num === 1);
    const next = setRoomCell(wb, '1학년', idx, '공통국어2', '도움실/1-1');
    expect(sheetOf(next, '1학년', '공통국어2', '1-1')!.main).toHaveLength(26);
    expect(sheetOf(next, '1학년', '공통국어2', '1-1')!.doum).toHaveLength(2);
    expect(sheetOf(wb, '1학년', '공통국어2', '1-1')!.main).toHaveLength(27);
  });

  it('학생·과목·계획 행을 추가·삭제한다', () => {
    let w = addStudent(wb, '1학년', { ban: 1, num: 29, name: '신입생', gender: '남' });
    const g1 = w.grades[0];
    const at = g1.students.findIndex((s) => s.name === '신입생');
    expect(g1.students[at - 1]).toMatchObject({ ban: 1 });
    expect(g1.students[at + 1]).toMatchObject({ ban: 2 });
    w = setRoomCell(w, '1학년', at, '공통국어2', '1-1');
    expect(sheetOf(w, '1학년', '공통국어2', '1-1')!.main).toHaveLength(28);
    w = setStudentField(w, '1학년', at, 'name', '전입생');
    expect(w.grades[0].students[at].name).toBe('전입생');
    w = removeStudent(w, '1학년', at);
    expect(w.grades[0].students).toHaveLength(195);

    w = addSubject(w, '1학년', '정보');
    expect(w.grades[0].headers.at(-1)).toBe('정보');
    w = removeSubject(w, '1학년', '정보');
    expect(w.grades[0].headers).not.toContain('정보');

    w = addPlanRow(w, { grade: '1학년', subject: '통합과학2' });
    expect(w.plan).toHaveLength(24);
    expect(w.plan.at(-1)!.row).toBe(25);
    w = updatePlanRow(w, 23, { timeRange: '09:00~09:50' });
    expect(w.plan[23].timeRange).toBe('09:00~09:50');
    w = removePlanRow(w, 0);
    expect(w.plan[0].row).toBe(2);
  });

  it('열 전체 바꾸기', () => {
    const { wb: w, count } = replaceInColumn(wb, '2학년', '기하', '교과3', '교과5');
    expect(count).toBe(34);
    expect(sheetOf(w, '2학년', '기하', '교과5')!.main).toHaveLength(34);
  });

  it('엑셀로 내보냈다 다시 읽어도 같은 결과가 나온다', () => {
    const again = parseWorkbook(new Uint8Array(exportWorkbook(wb)));
    expect(again.plan).toEqual(wb.plan);
    for (const [i, g] of wb.grades.entries()) {
      expect(again.grades[i].headers).toEqual(g.headers);
      expect(again.grades[i].students.map((s) => g.headers.map((h) => cellText(s.cells[h])))).toEqual(
        g.students.map((s) => g.headers.map((h) => cellText(s.cells[h]))),
      );
    }
    // 날짜로 바뀌었던 값도 텍스트 "2-7"로 저장된다
    expect(again.grades[1].students.some((s) => Object.values(s.cells).some((v) => typeof v === 'object' && v !== null))).toBe(false);
    const a = buildRosters(wb).rosters.map((r) => r.sheets.map((s) => `${s.roomName}:${s.main.length}`).join());
    const b = buildRosters(again).rosters.map((r) => r.sheets.map((s) => `${s.roomName}:${s.main.length}`).join());
    expect(b).toEqual(a);
  });
});
