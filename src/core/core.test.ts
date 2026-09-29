import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRosters, detectVacancies, parseRoomCell, parseWorkbook, validatePlan, findConflicts } from './index';

describe('parseRoomCell', () => {
  it('규칙 표대로 분류한다', () => {
    expect(parseRoomCell('1-1')).toMatchObject({ kind: 'normal', room: '1-1' });
    expect(parseRoomCell({ month: 2, day: 7 })).toMatchObject({ kind: 'normal', room: '2-7', fromDate: true });
    expect(parseRoomCell('교과3')).toMatchObject({ kind: 'normal', room: '교과3' });
    expect(parseRoomCell('도움실/1-1')).toMatchObject({ kind: 'doum', room: '도움실', owner: '1-1' });
    expect(parseRoomCell('도움실')).toMatchObject({ kind: 'doum', owner: null });
    expect(parseRoomCell('★교과2★/1-6')).toMatchObject({ kind: 'separate', room: '교과2', owner: '1-6' });
    expect(parseRoomCell('★교과2★')).toMatchObject({ kind: 'separate', room: '교과2', owner: null });
    expect(parseRoomCell('(대기실)')).toMatchObject({ kind: 'waiting', room: '대기실' });
    expect(parseRoomCell('멀티실')).toMatchObject({ kind: 'waiting', room: '멀티실' });
    expect(parseRoomCell('★하교')).toBeNull();
    expect(parseRoomCell('(미등교)')).toBeNull();
    expect(parseRoomCell('도움실/?')).toMatchObject({ kind: 'unknownOwner' });
    expect(parseRoomCell('배려자')).toMatchObject({ kind: 'unrecognized' });
  });

  it('고사실/소속 표기 — 별도 고사실·도움실에 소속 분반을 적는다', () => {
    expect(parseRoomCell('교과7/3-5')).toMatchObject({ kind: 'separate', room: '교과7', owner: '3-5' });
    expect(parseRoomCell('도움실/3-7')).toMatchObject({ kind: 'doum', room: '도움실', owner: '3-7' });
    expect(parseRoomCell('3-6/3-5')).toMatchObject({ kind: 'separate', room: '3-6', owner: '3-5' }); // 다른 반 교실을 별도실로
    expect(parseRoomCell('3-5/3-5')).toMatchObject({ kind: 'normal', room: '3-5' });
  });

  it('다른 순서·예전 표기도 받는다', () => {
    expect(parseRoomCell('3-7/도움실')).toMatchObject({ kind: 'doum', room: '도움실', owner: '3-7' });
    expect(parseRoomCell('3-5/교과7')).toMatchObject({ kind: 'separate', room: '교과7', owner: '3-5' });
    expect(parseRoomCell('별도실/교과7')).toMatchObject({ kind: 'separate', room: '교과7', owner: null });
    expect(parseRoomCell('교과7/별도실')).toMatchObject({ kind: 'separate', room: '교과7', owner: null });
    expect(parseRoomCell('★교과7★')).toMatchObject({ kind: 'separate', room: '교과7', owner: null });
    expect(parseRoomCell('교과7')).toMatchObject({ kind: 'normal', room: '교과7' }); // 단독 = 일반 고사실
    expect(parseRoomCell('?/3-5')).toMatchObject({ kind: 'unknownOwner' });
  });
});

const fixture = resolve(__dirname, '../../fixtures/2026-2-mid.xlsx');

describe.skipIf(!existsSync(fixture))('실제 응시현황 파일', () => {
  const wb = parseWorkbook(readFileSync(fixture));
  const { rosters, issues } = buildRosters(wb);
  const find = (grade: string, subject: string) => rosters.find((r) => r.grade === grade && r.subject === subject)!;
  const sheet = (grade: string, subject: string, room: string) => find(grade, subject).sheets.find((s) => s.roomName === room)!;

  it('시트를 읽는다', () => {
    expect(wb.grades.map((g) => [g.grade, g.students.length])).toEqual([
      ['1학년', 195],
      ['2학년', 195],
      ['3학년', 197],
    ]);
    expect(wb.plan).toHaveLength(23);
    expect(wb.plan[0]).toMatchObject({ dateStr: '2026-10-06', period: 1, grade: '1학년', subject: '공통국어2' });
  });

  it('1학년 공통국어2: 학급 7실 + 도움실 + 교과2', () => {
    const r = find('1학년', '공통국어2');
    expect(r.sheets.map((s) => s.roomName)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '도움실', '교과2']);
    const s11 = sheet('1학년', '공통국어2', '1-1');
    expect(s11.main).toHaveLength(27);
    expect(s11.doum).toHaveLength(1);
    expect(s11.classes).toEqual(['1-1']);
    expect(sheet('1학년', '공통국어2', '1-6').separate).toHaveLength(1);
    expect(sheet('1학년', '공통국어2', '도움실').main).toHaveLength(3);
  });

  it('2학년 기하: 대기실 65, 교과3 34, 2-1 30', () => {
    expect(sheet('2학년', '기하', '대기실')).toMatchObject({ kind: 'waiting' });
    expect(sheet('2학년', '기하', '대기실').main).toHaveLength(65);
    expect(sheet('2학년', '기하', '교과3').main).toHaveLength(34);
    expect(sheet('2학년', '기하', '2-1').main).toHaveLength(30);
  });

  it('날짜로 바뀐 셀을 복원하고, 소속 없는 도움실은 본인 학급에 연결한다', () => {
    // 2학년 물질과에너지: 2-7 26명 중 1명이 날짜로 저장됨
    expect(sheet('2학년', '물질과에너지', '2-7').main).toHaveLength(27);
    const doum = sheet('2학년', '세포와물질대사', '도움실').main[0];
    const owner = sheet('2학년', '세포와물질대사', `2-${doum.ban}`);
    if (owner) expect(owner.doum).toContainEqual(doum);
  });

  it('소속 없는 도움실과 몇 명만 배정된 단독 교과실을 경고한다', () => {
    const msgs = issues.map((i) => i.message);
    // 3학년 김민성 1명만 '교과7' (별도 고사실로 보이는데 소속이 없음)
    expect(msgs.some((m) => m.includes('확률과 통계') && m.includes('교과7에 1명만') && m.includes('교과7/3-5'))).toBe(true);
    // 2학년 도움실 — 소속 분반 미기재
    expect(msgs.some((m) => m.includes('미적분') && m.includes('소속 분반이 없는 도움실'))).toBe(true);
    // 1학년은 '도움실/1-1'처럼 소속이 적혀 있어 경고 없음
    expect(msgs.some((m) => m.includes('1학년 공통국어2') && m.includes('소속 분반이 없는'))).toBe(false);
  });

  it('교과7/3-5로 고치면 3-5 현황표의 별도실 칸에 들어가고 경고가 사라진다', () => {
    const g3 = wb.grades.find((g) => g.grade === '3학년')!;
    const idx = g3.students.findIndex((s) => s.cells['확률과통계'] === '교과7');
    const s = g3.students[idx];
    const fixed = {
      ...wb,
      grades: wb.grades.map((g) =>
        g.grade !== '3학년' ? g : { ...g, students: g.students.map((x, i) => (i === idx ? { ...x, cells: { ...x.cells, 확률과통계: `교과7/3-${s.ban}` } } : x)) },
      ),
    };
    const r = buildRosters(fixed);
    const subj = r.rosters.find((x) => x.grade === '3학년' && x.subject === '확률과 통계')!;
    expect(subj.sheets.find((x) => x.roomName === '교과7')).toMatchObject({ kind: 'separate' });
    expect(subj.sheets.find((x) => x.roomName === `3-${s.ban}`)!.separate.map((x) => x.name)).toContain(s.name);
    expect(r.issues.some((i) => i.message.includes('확률과 통계') && i.message.includes('교과7에 1명만'))).toBe(false);
  });

  it('계획 오류를 경고한다', () => {
    const planIssues = validatePlan(wb).map((i) => i.message);
    expect(planIssues.some((m) => m.includes('공통국어2') && m.includes('2번'))).toBe(true);
    expect(planIssues.some((m) => m.includes('윤리와사상') && m.includes('빠릅니다'))).toBe(true);
    expect(findConflicts(rosters)).toBeInstanceOf(Array);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('결번 후보를 찾는다', () => {
    const v = detectVacancies(wb.grades);
    expect(v.every((x) => /^\d{5}$/.test(x.hakbeon))).toBe(true);
  });
});
