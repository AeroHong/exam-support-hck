import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addPlanRow, addStudent, cellText, diffWorkbook, mergeWorkbook, parseWorkbook, removePlanRow, setRoomCell, updatePlanRow } from './index';

const fixture = resolve(__dirname, '../../fixtures/2026-2-mid.xlsx');

describe.skipIf(!existsSync(fixture))('동시 편집 3-way 병합', () => {
  const wb = parseWorkbook(readFileSync(fixture));
  const base = { workbook: wb, title: '중간고사', vacancies: [] };
  const cell = (w: typeof wb, grade: string, i: number, subject: string) =>
    cellText(w.grades.find((g) => g.grade === grade)!.students[i].cells[subject] ?? null);

  it('서로 다른 칸을 고치면 둘 다 살린다', () => {
    const mine = { ...base, workbook: setRoomCell(wb, '3학년', 0, '확률과통계', '도움실') };
    const theirs = { ...base, workbook: setRoomCell(wb, '2학년', 0, '영어2', '2-3') };
    const r = mergeWorkbook(base, mine, theirs);
    expect(cell(r.workbook, '3학년', 0, '확률과통계')).toBe('도움실');
    expect(cell(r.workbook, '2학년', 0, '영어2')).toBe('2-3');
    expect(r.conflicts).toEqual([]);
    expect(r.applied).toBe(1);
  });

  it('같은 칸을 다르게 고치면 최신본을 남기고 충돌로 알린다', () => {
    const mine = { ...base, workbook: setRoomCell(wb, '1학년', 0, '공통국어2', '도움실/1-1') };
    const theirs = { ...base, workbook: setRoomCell(wb, '1학년', 0, '공통국어2', '★교과2★/1-1') };
    const r = mergeWorkbook(base, mine, theirs);
    expect(cell(r.workbook, '1학년', 0, '공통국어2')).toBe('★교과2★/1-1');
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toContain('공통국어2');
  });

  it('같은 값으로 고친 건 충돌이 아니다', () => {
    const w = setRoomCell(wb, '1학년', 0, '공통국어2', '1-2');
    const r = mergeWorkbook(base, { ...base, workbook: w }, { ...base, workbook: w });
    expect(r.conflicts).toEqual([]);
  });

  it('시험 계획 추가·수정·삭제와 학생 추가를 최신본 위에 다시 적용한다', () => {
    let mineWb = addPlanRow(wb, { grade: '1학년', subject: '정보', dateStr: '2026-10-14' });
    mineWb = updatePlanRow(mineWb, 11, { timeRange: '09:30~10:00' });
    mineWb = removePlanRow(mineWb, 12);
    mineWb = addStudent(mineWb, '1학년', { ban: 1, num: 29, name: '전입생', gender: '여' });
    const theirsWb = setRoomCell(addPlanRow(wb, { grade: '2학년', subject: '기하2', dateStr: '2026-10-15' }), '2학년', 0, '영어2', '2-3');
    const r = mergeWorkbook(base, { ...base, workbook: mineWb }, { ...base, workbook: theirsWb });
    const subjects = r.workbook.plan.map((p) => p.subject);
    expect(subjects).toContain('정보'); // 내가 추가
    expect(subjects).toContain('기하2'); // 상대가 추가
    expect(r.workbook.plan.find((p) => p.subject === '윤리와사상')!.timeRange).toBe('09:30~10:00'); // 내가 고침
    expect(r.workbook.plan).toHaveLength(wb.plan.length + 1); // +정보 +기하2 -1행
    expect(r.workbook.grades[0].students.some((s) => s.name === '전입생')).toBe(true);
    expect(cell(r.workbook, '2학년', 0, '영어2')).toBe('2-3');
    expect(r.conflicts).toEqual([]);
  });

  it('병합 결과를 최신본과 비교하면 내 변경만 남는다', () => {
    const mine = { ...base, workbook: setRoomCell(wb, '3학년', 5, '미적분', '3-7') };
    const theirs = { ...base, workbook: setRoomCell(wb, '2학년', 0, '영어2', '2-3') };
    const r = mergeWorkbook(base, mine, theirs);
    const d = diffWorkbook(theirs.workbook, r.workbook);
    expect(d.count).toBe(1);
    expect(d.lines[0]).toContain('미적분');
  });
});
