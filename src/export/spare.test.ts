import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildRosters, parseWorkbook } from '../core';
import { buildSpreadsheetRequests } from './gsheets';
import { spareSubjectSizeMm } from './spare';
import { buildSubjectWorkbook } from './xlsx';

describe('여분 표지 글자 크기', () => {
  it('과목명이 길수록 작아지되 폭(168mm) 안에 들어간다', () => {
    expect(spareSubjectSizeMm('영어')).toBe(44);
    for (const s of ['공통국어2', '확률과통계', '일본어회화 Ⅰ', '인공지능 수학과 데이터 과학']) {
      expect(spareSubjectSizeMm(s) * [...s].length).toBeLessThanOrEqual(168);
    }
  });
});

const fixture = resolve(__dirname, '../../fixtures/2026-2-mid.xlsx');
describe.skipIf(!existsSync(fixture))('여분 표지 내보내기', () => {
  const r = buildRosters(parseWorkbook(readFileSync(fixture))).rosters[0];

  it('XLSX: 옵션을 켜면 마지막에 여분 시트', async () => {
    const off = new ExcelJS.Workbook();
    await off.xlsx.load(await buildSubjectWorkbook(r));
    expect(off.worksheets.map((w) => w.name)).not.toContain('여분');
    const on = new ExcelJS.Workbook();
    await on.xlsx.load(await buildSubjectWorkbook(r, { withSpare: true }));
    const ws = on.worksheets.at(-1)!;
    expect(ws.name).toBe('여분');
    expect(ws.getCell('A3').value).toBe(r.subject);
    expect(ws.getCell('A4').value).toBe('여  분');
  });

  it('Google 시트: 옵션을 켜면 여분 시트 추가', () => {
    const titles = (reqs: Record<string, any>[]) => reqs.flatMap((q) => (q.addSheet ? [q.addSheet.properties.title] : []));
    expect(titles(buildSpreadsheetRequests(r))).not.toContain('여분');
    expect(titles(buildSpreadsheetRequests(r, { withSpare: true })).at(-1)).toBe('여분');
  });
});
