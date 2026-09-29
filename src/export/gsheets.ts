// Google 스프레드시트 내보내기 — legacy code.gs buildSheetRequests를 응시현황표양식0923 배치로 옮긴 것
import type { RoomSheet, SubjectRoster } from '../core';
import { makeHakbeon, SEAT_ROWS, seatRowHeightMm, SUMMARY_NOTES, summarize } from '../core';
import { SHEET_COLORS } from './theme';
import { subjectFileName } from './xlsx';

type Req = Record<string, unknown>;
type Cell = string | number | null;

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue: parseInt(hex.slice(4, 6), 16) / 255,
});
type Color = ReturnType<typeof rgb>;
const C = SHEET_COLORS;

const range = (sheetId: number, r1: number, c1: number, r2: number, c2: number) => ({
  sheetId,
  startRowIndex: r1,
  endRowIndex: r2,
  startColumnIndex: c1,
  endColumnIndex: c2,
});

const softLine = { style: 'SOLID', width: 1, color: rgb(C.lineSoft) };
const strongLine = { style: 'SOLID_MEDIUM', color: rgb(C.lineStrong) };

interface Fmt {
  bg?: string;
  ink?: string;
  bold?: boolean;
  size?: number;
}

/** 칸 서식 + 옅은 안쪽선 (0-based, 끝 미포함) */
function boxFormat(sheetId: number, r1: number, c1: number, r2: number, c2: number, f: Fmt = {}): Req {
  return {
    repeatCell: {
      range: range(sheetId, r1, c1, r2, c2),
      cell: {
        userEnteredFormat: {
          backgroundColor: f.bg ? rgb(f.bg) : undefined,
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
          textFormat: { bold: f.bold ?? true, fontSize: f.size ?? 10, foregroundColor: rgb(f.ink ?? C.ink) },
          borders: { top: softLine, bottom: softLine, left: softLine, right: softLine },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat,borders)',
    },
  };
}

/** 표 블록 바깥선만 진하게 */
function outline(sheetId: number, r1: number, c1: number, r2: number, c2: number): Req {
  return {
    updateBorders: {
      range: range(sheetId, r1, c1, r2, c2),
      top: strongLine,
      bottom: strongLine,
      left: strongLine,
      right: strongLine,
    },
  };
}

// 글자는 모두 검정·굵게 (boxFormat 기본값), 머리글은 배경색으로만 구분
const HEAD: Fmt = { bg: C.headBg, size: 9 };
const LIST_HEAD: Fmt = { bg: C.listHeadBg, size: 9 };
const SUM_HEAD: Fmt = { bg: C.sumHeadBg, size: 9 };
const MM_TO_PX = 3.78;

/** 제목: 고사실 · 과목 · 응시현황표 (모두 검정·굵게, 크기만 다르게) */
function titleCell(roomName: string, subject: string, kind: string) {
  const text = `${roomName}   ${subject}   ${kind}`;
  const run = (startIndex: number, color: Color, fontSize: number, bold: boolean) => ({
    startIndex,
    format: { foregroundColor: color, fontSize, bold },
  });
  return {
    userEnteredValue: { stringValue: text },
    textFormatRuns: [
      run(0, rgb(C.ink), 20, true),
      run(roomName.length + 3, rgb(C.ink), 18, true),
      run(roomName.length + subject.length + 6, rgb(C.ink), 14, true),
    ],
  };
}

function toCell(v: Cell) {
  if (v === null || v === '') return {};
  return { userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: v } };
}

/** 현황표 1장(대기실은 50명 단위로 여러 장)의 시트 추가 + 서식 요청 */
function sheetRequests(firstSheetId: number, sheet: RoomSheet, isFirst: boolean): { requests: Req[]; count: number } {
  const sum = summarize(sheet);
  const requests: Req[] = [];

  sum.pages.forEach((students, p) => {
    const sheetId = firstSheetId + p;
    const title = (sum.pages.length > 1 ? `${sheet.roomName}(${p + 1})` : sheet.roomName).slice(0, 90);
    const notesRow = 6 + sum.rows.length; // 요약표 아래 한 줄 띄고 안내 문구 (0-based 12, 13)
    const lastRow = Math.max(notesRow + SUMMARY_NOTES.length, 6 + students.length); // 안내 문구와 명단 중 긴 쪽까지만
    const gridProperties = { rowCount: lastRow, columnCount: 9 };
    if (isFirst && p === 0) {
      requests.push({ updateSheetProperties: { properties: { sheetId: 0, title, gridProperties }, fields: 'title,gridProperties' } });
    } else {
      requests.push({ addSheet: { properties: { sheetId, title, gridProperties } } });
    }
    const sid = isFirst && p === 0 ? 0 : sheetId;

    const rows: Cell[][] = [];
    rows.push([]); // 제목은 아래 textFormatRuns로 따로 넣는다
    rows.push([]);
    rows.push(['고사일\n고사시간', '고사실', '과목명(과목코드)', '학급', null, null, null, '인원수', '학번']);
    rows.push([sum.dateTime, sheet.roomName, sum.subjectLabel, sum.classLabel, null, null, '재적인원', sum.enrolled, sum.enrolledRange || null]);
    rows.push([null, null, null, null, null, null, '구분', '인원수', '학번']);
    for (let i = 0; i < lastRow - 6; i++) {
      const s = students[i];
      const left: Cell[] = s ? [p * SEAT_ROWS + i + 1, makeHakbeon(s.grade, s.ban, s.num), s.name, s.gender, null] : [null, null, null, null, null];
      // 명단 머리글은 6행, 요약표는 6~11행
      if (i === 0) rows.push(['좌석번호', '학번', '이름', '성별', '결시체크', null, ...summaryCells(sum, 0)]);
      rows.push([...left, null, ...(i + 1 < sum.rows.length ? summaryCells(sum, i + 1) : [null, null, null])]);
    }
    SUMMARY_NOTES.forEach((text, i) => (rows[notesRow + i][6] = `※ ${text}`));

    requests.push({
      updateCells: {
        rows: rows.map((r) => ({ values: r.map(toCell) })),
        fields: 'userEnteredValue',
        start: { sheetId: sid, rowIndex: 0, columnIndex: 0 },
      },
    });

    const kind = (sheet.kind === 'waiting' ? '대기실 현황표' : '응시현황표') + (sum.pages.length > 1 ? `  (${p + 1}/${sum.pages.length})` : '');
    requests.push({ mergeCells: { range: range(sid, 0, 0, 1, 9), mergeType: 'MERGE_ALL' } });
    requests.push({
      updateCells: {
        rows: [{ values: [titleCell(sheet.roomName, sheet.subject, kind)] }],
        fields: 'userEnteredValue,textFormatRuns',
        start: { sheetId: sid, rowIndex: 0, columnIndex: 0 },
      },
    });
    requests.push({
      repeatCell: {
        range: range(sid, 0, 0, 1, 9),
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            borders: { bottom: { style: 'SOLID_MEDIUM', color: rgb(C.accent) } },
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,borders)',
      },
    });

    // 고사 정보 (A3:D4)
    requests.push(boxFormat(sid, 2, 0, 3, 4, HEAD));
    requests.push(boxFormat(sid, 3, 0, 4, 4));
    requests.push(boxFormat(sid, 3, 1, 4, 2, { size: 11 }));
    requests.push(outline(sid, 2, 0, 4, 4));
    // 재적인원 (G3:I4)
    requests.push(boxFormat(sid, 2, 6, 3, 9, SUM_HEAD));
    requests.push(boxFormat(sid, 3, 6, 4, 7, SUM_HEAD));
    requests.push(boxFormat(sid, 3, 7, 4, 8, { size: 11 }));
    requests.push(boxFormat(sid, 3, 8, 4, 9, { size: 9 }));
    requests.push(outline(sid, 2, 6, 4, 9));
    // 요약표 (G5:I11)
    requests.push(boxFormat(sid, 4, 6, 5, 9, SUM_HEAD));
    requests.push(boxFormat(sid, 5, 6, 5 + sum.rows.length, 7, SUM_HEAD));
    requests.push(boxFormat(sid, 5, 7, 5 + sum.rows.length, 8, { size: 11 }));
    requests.push(boxFormat(sid, 5, 7, 6, 8, { size: 11, ink: C.provisional })); // 응시1교실: 결시로 바뀌는 값
    requests.push(boxFormat(sid, 5, 8, 5 + sum.rows.length, 9, { size: 8 }));
    requests.push(outline(sid, 4, 6, 5 + sum.rows.length, 9));
    // 요약표 아래 안내 문구 (G:I 병합, 테두리 없음)
    SUMMARY_NOTES.forEach((_, i) => {
      requests.push({ mergeCells: { range: range(sid, notesRow + i, 6, notesRow + i + 1, 9), mergeType: 'MERGE_ALL' } });
      requests.push({
        repeatCell: {
          range: range(sid, notesRow + i, 6, notesRow + i + 1, 9),
          cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', textFormat: { bold: true, fontSize: 8, foregroundColor: rgb(C.ink) } } },
          fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)',
        },
      });
    });
    // 명단 (A6:E…)
    requests.push(boxFormat(sid, 5, 0, 6, 5, LIST_HEAD));
    if (students.length > 0) {
      requests.push(boxFormat(sid, 6, 0, 6 + students.length, 5));
      requests.push(boxFormat(sid, 6, 0, 6 + students.length, 1, { size: 9 }));
      requests.push({
        addBanding: {
          bandedRange: {
            range: range(sid, 6, 0, 6 + students.length, 5),
            rowProperties: { firstBandColor: rgb('FFFFFF'), secondBandColor: rgb(C.zebra) },
          },
        },
      });
    }
    requests.push(outline(sid, 5, 0, 6 + students.length, 5));
    if (students.length > 0) {
      requests.push({
        setDataValidation: {
          range: range(sid, 6, 4, 6 + students.length, 5),
          rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true },
        },
      });
    }

    const heights: [number, number, number][] = [
      [0, 1, 44],
      [1, 2, 8],
      [2, 4, 38],
      [4, 6, 28],
      [6, lastRow, Math.round(seatRowHeightMm(students.length) * MM_TO_PX)],
    ];
    for (const [s, e, px] of heights) {
      requests.push({
        updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: s, endIndex: e }, properties: { pixelSize: px }, fields: 'pixelSize' },
      });
    }
    [70, 80, 110, 90, 70, 20, 100, 70, 160].forEach((px, c) => {
      requests.push({
        updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
      });
    });
  });

  return { requests, count: sum.pages.length };
}

function summaryCells(sum: ReturnType<typeof summarize>, i: number): Cell[] {
  const r = sum.rows[i];
  return [r.label, r.count === '' ? null : r.count, r.detail.replace(/\n/g, ', ') || null];
}

export function buildSpreadsheetRequests(r: SubjectRoster): Req[] {
  const all: Req[] = [];
  let nextId = 1000;
  r.sheets.forEach((s, i) => {
    const { requests, count } = sheetRequests(nextId, s, i === 0);
    all.push(...requests);
    nextId += count;
  });
  return all;
}

async function gapi<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API 오류 ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface GSheetsResult {
  folderUrl: string;
  files: { name: string; url: string }[];
}

export interface GSheetsTarget {
  parentId: string | null; // Picker로 고른 폴더(공유 드라이브 포함). null이면 내 드라이브 루트
  subfolderName: string | null; // 값이 있으면 그 안에 하위 폴더를 만들어 저장
}

// 공유 드라이브에 쓰려면 모든 Drive 호출에 supportsAllDrives가 필요하다
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true';

/** 과목마다 스프레드시트 1개(고사실별 시트)를 지정한 폴더에 만든다 */
export async function exportToGoogleSheets(
  token: string,
  rosters: SubjectRoster[],
  target: GSheetsTarget,
  onProgress?: (done: number, total: number) => void,
): Promise<GSheetsResult> {
  let folderId = target.parentId;
  if (target.subfolderName) {
    const folder = await gapi<{ id: string }>(token, DRIVE_FILES, {
      method: 'POST',
      body: JSON.stringify({
        name: target.subfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(folderId ? { parents: [folderId] } : {}),
      }),
    });
    folderId = folder.id;
  }

  const files: GSheetsResult['files'] = [];
  for (const [i, r] of rosters.entries()) {
    const name = subjectFileName(r, '').replace(/\.$/, '');
    const file = await gapi<{ id: string }>(token, DRIVE_FILES, {
      method: 'POST',
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        ...(folderId ? { parents: [folderId] } : {}),
      }),
    });
    await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${file.id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: buildSpreadsheetRequests(r) }),
    });
    files.push({ name, url: `https://docs.google.com/spreadsheets/d/${file.id}/edit` });
    onProgress?.(i + 1, rosters.length);
  }
  return {
    folderUrl: folderId ? `https://drive.google.com/drive/folders/${folderId}` : 'https://drive.google.com/drive/my-drive',
    files,
  };
}
