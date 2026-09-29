// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractTables, parseTimetable } from './hwpxTimetable';

const fixture = resolve(__dirname, '../../fixtures/timetable-2026-2-mid.hwpx');

describe.skipIf(!existsSync(fixture))('한글 시험 시간표(hwpx) 읽기', async () => {
  const zip = await JSZip.loadAsync(readFileSync(fixture));
  const xml = await zip.file('Contents/section0.xml')!.async('string');
  const tables = extractTables(xml, new DOMParser());
  const r = parseTimetable(tables, 2026);
  const find = (grade: string, subject: string) => r.entries.filter((e) => e.grade === grade && e.subject === subject);

  it('표 4개를 읽고, 시간표 표 2개(2·3학년, 1학년)를 해석한다', () => {
    expect(tables).toHaveLength(4);
    expect(r.grades).toEqual(['1학년', '2학년', '3학년']);
    expect(r.issues).toEqual([]);
  });

  it('날짜 칸 병합·한 교시 두 과목을 풀어낸다', () => {
    expect(find('3학년', '영어독해와작문')[0]).toMatchObject({ dateStr: '2026-10-06', period: 1, code: '57', timeRange: '08:20~09:10', minutes: '50' });
    // 10/8 1교시: 3학년 심화국어 + 미적분 (같은 교시 두 줄)
    expect(find('3학년', '심화국어')[0]).toMatchObject({ dateStr: '2026-10-08', period: 1, timeRange: '08:30~09:10', minutes: '40 (10분 자습)' });
    expect(find('3학년', '미적분')[0]).toMatchObject({ dateStr: '2026-10-08', period: 1, code: '54', essay: true });
    // 10/12 1교시: 언어와매체는 시험시간 칸이 위 줄과 병합
    expect(find('3학년', '언어와매체')[0]).toMatchObject({ dateStr: '2026-10-12', period: 1, timeRange: '08:20~09:00' });
    expect(find('2학년', '기하')[0]).toMatchObject({ dateStr: '2026-10-07', period: 2, scope: '(1,교과3)', essay: true });
  });

  it('날짜 칸이 없는 1학년 표를 교시 순서로 날짜에 맞춘다', () => {
    const g1 = r.entries.filter((e) => e.grade === '1학년').map((e) => `${e.dateStr} ${e.period} ${e.subject} ${e.code}`);
    expect(g1).toEqual([
      '2026-10-06 1 공통영어2 2',
      '2026-10-07 1 공통수학2 3',
      '2026-10-08 1 공통국어2 1',
      '2026-10-12 1 통합사회2 5',
      '2026-10-12 2 한국사2 4',
      '2026-10-13 1 통합과학2 6',
    ]);
  });

  it('서답형 표시는 과목명에서 빼고 따로 남긴다', () => {
    const e = find('2학년', '미적분1')[0];
    expect(e.subject).toBe('미적분1');
    expect(e.essay).toBe(true);
    expect(find('3학년', '영어독해와작문')[0].essay).toBe(false);
  });
});

describe.skipIf(!existsSync(fixture) || !existsSync(resolve(__dirname, '../../fixtures/2026-2-mid.xlsx')))('시간표 ↔ 시험 계획 비교', async () => {
  const { parseWorkbook, comparePlan, validatePlan } = await import('./index');
  const zip = await JSZip.loadAsync(readFileSync(fixture));
  const xml = await zip.file('Contents/section0.xml')!.async('string');
  const t = parseTimetable(extractTables(xml, new DOMParser()), 2026);
  const wb = parseWorkbook(readFileSync(resolve(__dirname, '../../fixtures/2026-2-mid.xlsx')));
  const cmp = comparePlan(wb, t.entries, t.grades);

  it('엑셀 계획의 옮겨 적기 실수(1학년 10/6 공통국어2 → 공통영어2)를 잡아낸다', () => {
    expect(cmp.rows.some((r) => r.status === 'added' && r.grade === '1학년' && r.subject === '공통영어2')).toBe(true);
    const kor = cmp.rows.filter((r) => r.grade === '1학년' && r.subject === '공통국어2');
    // 엑셀엔 공통국어2가 두 번(10/6 코드2, 10/8 코드1) → 10/8은 그대로, 10/6은 삭제
    expect(kor.map((r) => r.status).sort()).toEqual(['removed', 'same']);
  });

  it('적용하면 시험 계획이 시간표와 같아지고 중복 경고가 사라진다', () => {
    const next = { ...wb, plan: cmp.merged };
    expect(next.plan).toHaveLength(t.entries.length);
    expect(validatePlan(next).some((i) => i.message.includes('시험 계획에 2번'))).toBe(false);
    expect(cmp.merged.find((p) => p.grade === '3학년' && p.subject === '윤리와사상')!.timeRange).toBe('09:30~10:00');
  });
});
