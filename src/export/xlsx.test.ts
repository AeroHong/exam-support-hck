import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildRosters, parseWorkbook } from '../core';
import { buildSubjectWorkbook } from './xlsx';

const fixture = resolve(__dirname, '../../fixtures/2026-2-mid.xlsx');

describe.skipIf(!existsSync(fixture))('xlsx 내보내기', () => {
  it('과목 1개 = 고사실별 시트, 양식 칸 위치가 맞다', async () => {
    const { rosters } = buildRosters(parseWorkbook(readFileSync(fixture)));
    const r = rosters.find((x) => x.grade === '1학년' && x.subject === '공통국어2')!;
    const buf = await buildSubjectWorkbook(r);
    if (process.env.DUMP_XLSX) writeFileSync(process.env.DUMP_XLSX, Buffer.from(buf));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '도움실', '교과2']);
    const ws = wb.getWorksheet('1-1')!;
    const title = ws.getCell('A1').value as { richText: { text: string }[] };
    expect(title.richText.map((r) => r.text.trim())).toEqual(['1-1', '공통국어2', '응시현황표']);
    expect(ws.getCell('H4').value).toBe(28);
    expect(ws.getCell('I4').value).toBe('10101 ~ 10128');
    expect(ws.getCell('G7').value).toBe('응시2도움실');
    expect(ws.getCell('H7').value).toBe(1);
    expect(ws.getCell('B7').value).toBe('10101');
    // 응시 27명 → 7~33행까지만 명단, 그 아래 빈 행 없음
    expect(ws.getCell('A33').value).toBe(27);
    expect(ws.getCell('A33').border?.bottom?.style).toBe('medium');
    expect(ws.getCell('A34').border).toBeUndefined();
    expect(ws.pageSetup.printArea).toBe('A1:I33');
  });
});
