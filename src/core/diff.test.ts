import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addPlanRow, addStudent, diffWorkbook, parseWorkbook, setRoomCell, updatePlanRow } from './index';

const fixture = resolve(__dirname, '../../fixtures/2026-2-mid.xlsx');

describe.skipIf(!existsSync(fixture))('저장 전후 비교', () => {
  const wb = parseWorkbook(readFileSync(fixture));

  it('변경이 없으면 0건', () => {
    expect(diffWorkbook(wb, wb)).toMatchObject({ count: 0, summary: '변경 없음' });
  });

  it('칸·계획·학생·결번 변경을 읽을 수 있게 남긴다', () => {
    let w = setRoomCell(wb, '1학년', 0, '공통국어2', '도움실/1-1');
    w = updatePlanRow(w, 11, { timeRange: '09:30~10:00' });
    w = addPlanRow(w, { grade: '1학년', subject: '정보' });
    w = addStudent(w, '1학년', { ban: 1, num: 29, name: '전입생', gender: '여' });
    const d = diffWorkbook(wb, w, {
      prevTitle: 'A',
      nextTitle: 'B',
      prevVacancies: [],
      nextVacancies: [{ hakbeon: '10222', type: '결번' }],
    });
    expect(d.lines).toContain('[1학년] 10101 권용준 · 공통국어2: 1-1 → 도움실/1-1');
    expect(d.lines).toContain('[시험 계획] 2026-10-08 2교시 3학년 윤리와사상 — 시간: 09:30~09:10 → 09:30~10:00');
    expect(d.lines.some((l) => l.startsWith('[시험 계획] 추가:') && l.includes('정보'))).toBe(true);
    expect(d.lines).toContain('[1학년] 학생 추가/변경: 10129 전입생 (여)');
    expect(d.lines).toContain('[결번] 추가: 10222 (결번)');
    expect(d.lines).toContain('[시험 이름] A → B');
    expect(d.count).toBe(6);
    expect(d.summary).toBe('시험 이름, 시험 계획 2건, 1학년 1칸 1건, 결번 1건');
  });

  it('새 자료는 요약만', () => {
    expect(diffWorkbook(null, wb).summary).toBe('새 자료 (시험 23건, 학생 587명)');
  });
});
