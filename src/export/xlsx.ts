import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { RoomSheet, SubjectRoster } from '../core';
import { makeHakbeon, SEAT_ROWS, seatRowHeightMm, summarize } from '../core';
import { SHEET_COLORS, SHEET_FONT } from './theme';

const C = SHEET_COLORS;
const argb = (hex: string) => `FF${hex}`;

const soft: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: argb(C.lineSoft) } };
const strong: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: argb(C.lineStrong) } };
const center: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };

interface CellStyle {
  fill?: string;
  ink?: string;
  bold?: boolean;
  size?: number;
}

function style(cell: ExcelJS.Cell, opts: CellStyle = {}) {
  cell.border = { top: soft, left: soft, bottom: soft, right: soft };
  cell.alignment = center;
  cell.font = { name: SHEET_FONT, size: opts.size ?? 10, bold: opts.bold, color: { argb: argb(opts.ink ?? C.ink) } };
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(opts.fill) } };
}

/** 표 블록 바깥선만 진하게 (1-based 행·열) */
function outline(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        ...cell.border,
        ...(r === r1 ? { top: strong } : {}),
        ...(r === r2 ? { bottom: strong } : {}),
        ...(c === c1 ? { left: strong } : {}),
        ...(c === c2 ? { right: strong } : {}),
      };
    }
  }
}

const HEAD: CellStyle = { fill: C.headBg, ink: C.headInk, bold: true, size: 9 };
const LIST_HEAD: CellStyle = { fill: C.listHeadBg, ink: C.listHeadInk, bold: true, size: 9 };
const SUM_HEAD: CellStyle = { fill: C.sumHeadBg, ink: C.sumHeadInk, bold: true, size: 9 };
const MM_TO_PT = 2.835;

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
    const pageNote = sum.pages.length > 1 ? `  (${pageIdx + 1}/${sum.pages.length})` : '';
    title.value = {
      richText: [
        { text: sheet.roomName + '   ', font: { name: SHEET_FONT, size: 20, bold: true, color: { argb: argb(C.accent) } } },
        { text: sheet.subject + '   ', font: { name: SHEET_FONT, size: 18, bold: true, color: { argb: argb(C.ink) } } },
        { text: (sheet.kind === 'waiting' ? '대기실 현황표' : '응시현황표') + pageNote, font: { name: SHEET_FONT, size: 13, color: { argb: argb(C.muted) } } },
      ],
    };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.border = { bottom: { style: 'medium', color: { argb: argb(C.accent) } } };
    ws.getRow(1).height = 38;

    // 3~4행 머리글
    (['고사일\n고사시간', '고사실', '과목명(과목코드)', '학급'] as const).forEach((v, i) => {
      const c = ws.getRow(3).getCell(i + 1);
      c.value = v;
      style(c, HEAD);
    });
    [sum.dateTime, sheet.roomName, sum.subjectLabel, sum.classLabel].forEach((v, i) => {
      const c = ws.getRow(4).getCell(i + 1);
      c.value = v;
      style(c, { size: i === 3 && v.length > 12 ? 8 : i === 1 ? 11 : 10, bold: i === 1 });
    });
    outline(ws, 3, 1, 4, 4);

    // G3:I4 재적인원
    style(ws.getCell('G3'), SUM_HEAD);
    style(Object.assign(ws.getCell('H3'), { value: '인원수' }), SUM_HEAD);
    style(Object.assign(ws.getCell('I3'), { value: '학번' }), SUM_HEAD);
    style(Object.assign(ws.getCell('G4'), { value: '재적인원' }), SUM_HEAD);
    style(Object.assign(ws.getCell('H4'), { value: sum.enrolled }), { size: 11, bold: true });
    style(Object.assign(ws.getCell('I4'), { value: sum.enrolledRange || null }), { size: 9, bold: true });
    outline(ws, 3, 7, 4, 9);

    // G5:I11 요약표
    style(Object.assign(ws.getCell('G5'), { value: '구분' }), SUM_HEAD);
    style(Object.assign(ws.getCell('H5'), { value: '인원수' }), SUM_HEAD);
    style(Object.assign(ws.getCell('I5'), { value: '학번' }), SUM_HEAD);
    sum.rows.forEach((r, i) => {
      const row = ws.getRow(6 + i);
      style(Object.assign(row.getCell(7), { value: r.label }), SUM_HEAD);
      style(Object.assign(row.getCell(8), { value: r.count === '' ? null : r.count }), { size: 11, bold: true });
      style(Object.assign(row.getCell(9), { value: r.detail.replace(/\n/g, ', ') || null }), { size: 8 });
    });
    outline(ws, 5, 7, 5 + sum.rows.length, 9);

    // 6행 명단 머리글, 7행부터 응시 인원만큼만 명단
    ['좌석번호', '학번', '이름', '성별', '결시체크'].forEach((v, i) => {
      const c = ws.getRow(6).getCell(i + 1);
      c.value = v;
      style(c, LIST_HEAD);
    });
    const rowPt = seatRowHeightMm(students.length) * MM_TO_PT;
    students.forEach((s, i) => {
      const row = ws.getRow(7 + i);
      const values = [pageIdx * SEAT_ROWS + i + 1, makeHakbeon(s.grade, s.ban, s.num), s.name, s.gender, '☐'];
      const zebra = i % 2 === 1 ? C.zebra : undefined;
      values.forEach((v, ci) =>
        style(Object.assign(row.getCell(ci + 1), { value: v }), {
          fill: zebra,
          ink: ci === 0 ? C.muted : C.ink,
          bold: ci === 2,
          size: ci === 0 ? 9 : 10,
        }),
      );
      row.height = rowPt;
    });
    outline(ws, 6, 1, 6 + students.length, 5);

    ws.getRow(2).height = 8;
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
