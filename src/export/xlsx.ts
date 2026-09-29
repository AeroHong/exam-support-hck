import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { RoomSheet, SubjectRoster } from '../core';
import { makeHakbeon, SEAT_ROWS, summarize } from '../core';

// 응시현황표양식0923 색상
const GREEN = 'FFD9EAD3';
const ORANGE = 'FFFCE5CD';
const MINT = 'FFCDF2E4';
const FONT = 'Malgun Gothic';

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

function style(cell: ExcelJS.Cell, opts: { fill?: string; bold?: boolean; size?: number } = {}) {
  cell.border = box;
  cell.alignment = center;
  cell.font = { name: FONT, size: opts.size ?? 10, bold: opts.bold };
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, '_').slice(0, 28) || 'sheet';
  let n = base;
  for (let i = 2; used.has(n); i++) n = `${base}(${i})`;
  used.add(n);
  return n;
}

function addRoomSheet(wb: ExcelJS.Workbook, sheet: RoomSheet, used: Set<string>) {
  const sum = summarize(sheet);
  sum.pages.forEach((students, pageIdx) => {
    const name = safeSheetName(sum.pages.length > 1 ? `${sheet.roomName}(${pageIdx + 1})` : sheet.roomName, used);
    const ws = wb.addWorksheet(name, {
      pageSetup: {
        paperSize: 9,
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });

    ws.columns = [9, 11, 13, 13, 9, 3, 13, 9, 22].map((width) => ({ width }));

    // 1행 제목
    ws.mergeCells('A1:I1');
    const title = ws.getCell('A1');
    title.value = sum.title + (sum.pages.length > 1 ? ` (${pageIdx + 1}/${sum.pages.length})` : '');
    title.font = { name: FONT, size: 20, bold: true };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // 3~4행 머리글
    (['고사일\n고사시간', '고사실', '과목명(과목코드)', '학급'] as const).forEach((v, i) => {
      const c = ws.getRow(3).getCell(i + 1);
      c.value = v;
      style(c, { fill: GREEN, bold: true });
    });
    [sum.dateTime, sheet.roomName, sum.subjectLabel, sum.classLabel].forEach((v, i) => {
      const c = ws.getRow(4).getCell(i + 1);
      c.value = v;
      style(c, { size: i === 3 && v.length > 12 ? 8 : 10 });
    });

    // G3:I4 재적인원
    style(ws.getCell('G3'), { fill: MINT });
    style(Object.assign(ws.getCell('H3'), { value: '인원수' }), { fill: MINT, bold: true });
    style(Object.assign(ws.getCell('I3'), { value: '학번' }), { fill: MINT, bold: true });
    style(Object.assign(ws.getCell('G4'), { value: '재적인원' }), { fill: MINT, bold: true });
    style(Object.assign(ws.getCell('H4'), { value: sum.enrolled }), { size: 11 });
    style(ws.getCell('I4'));

    // G5:I11 요약표
    style(Object.assign(ws.getCell('G5'), { value: '구분' }), { fill: MINT, bold: true });
    style(Object.assign(ws.getCell('H5'), { value: '인원수' }), { fill: MINT, bold: true });
    style(Object.assign(ws.getCell('I5'), { value: '학번' }), { fill: MINT, bold: true });
    sum.rows.forEach((r, i) => {
      const row = ws.getRow(6 + i);
      style(Object.assign(row.getCell(7), { value: r.label }), { fill: MINT, bold: true });
      style(Object.assign(row.getCell(8), { value: r.count === '' ? null : r.count }), { size: 11 });
      style(Object.assign(row.getCell(9), { value: r.detail.replace(/\n/g, ', ') || null }), { size: 8 });
    });

    // 6행 명단 머리글, 7행부터 응시 인원만큼만 명단
    ['좌석번호', '학번', '이름', '성별', '결시체크'].forEach((v, i) => {
      const c = ws.getRow(6).getCell(i + 1);
      c.value = v;
      style(c, { fill: ORANGE, bold: true });
    });
    students.forEach((s, i) => {
      const row = ws.getRow(7 + i);
      const values = [pageIdx * SEAT_ROWS + i + 1, makeHakbeon(s.grade, s.ban, s.num), s.name, s.gender, '☐'];
      values.forEach((v, ci) => style(Object.assign(row.getCell(ci + 1), { value: v })));
      row.height = 15.5;
    });

    ws.getRow(2).height = 6;
    ws.getRow(3).height = 26;
    ws.getRow(4).height = 30;
    ws.getRow(5).height = 22;
    ws.getRow(6).height = 22;
    // 요약표가 11행까지 있으므로 명단이 짧아도 11행까지는 인쇄
    ws.pageSetup.printArea = `A1:I${Math.max(11, 6 + students.length)}`;
  });
}

export function subjectFileName(r: SubjectRoster, ext = 'xlsx'): string {
  return `${r.dateStr}_${r.grade}_${r.period}교시_${r.subject}.${ext}`.replace(/[\\/:*?"<>|]/g, '_');
}

export async function buildSubjectWorkbook(r: SubjectRoster): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '응시현황표 제작 도구';
  const used = new Set<string>();
  r.sheets.forEach((s) => addRoomSheet(wb, s, used));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** 과목이 하나면 xlsx, 여러 개면 zip */
export async function exportRostersToFile(rosters: SubjectRoster[]): Promise<{ blob: Blob; fileName: string }> {
  if (rosters.length === 1) {
    const buf = await buildSubjectWorkbook(rosters[0]);
    return {
      blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      fileName: subjectFileName(rosters[0]),
    };
  }
  const zip = new JSZip();
  for (const r of rosters) zip.file(subjectFileName(r), await buildSubjectWorkbook(r));
  return { blob: await zip.generateAsync({ type: 'blob' }), fileName: `응시현황표_${rosters.length}과목.zip` };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
