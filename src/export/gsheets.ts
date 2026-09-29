// Google 스프레드시트 내보내기 — legacy code.gs buildSheetRequests를 응시현황표양식0923 배치로 옮긴 것
import type { RoomSheet, SubjectRoster } from '../core';
import { makeHakbeon, SEAT_ROWS, summarize } from '../core';
import { subjectFileName } from './xlsx';

type Req = Record<string, unknown>;
type Cell = string | number | null;

const rgb = (hex: string) => ({
  red: parseInt(hex.slice(0, 2), 16) / 255,
  green: parseInt(hex.slice(2, 4), 16) / 255,
  blue: parseInt(hex.slice(4, 6), 16) / 255,
});
const GREEN = rgb('D9EAD3');
const ORANGE = rgb('FCE5CD');
const MINT = rgb('CDF2E4');

const range = (sheetId: number, r1: number, c1: number, r2: number, c2: number) => ({
  sheetId,
  startRowIndex: r1,
  endRowIndex: r2,
  startColumnIndex: c1,
  endColumnIndex: c2,
});

const solid = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };

function boxFormat(sheetId: number, r1: number, c1: number, r2: number, c2: number, bg?: typeof GREEN, bold = false, fontSize = 10): Req {
  return {
    repeatCell: {
      range: range(sheetId, r1, c1, r2, c2),
      cell: {
        userEnteredFormat: {
          backgroundColor: bg,
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          wrapStrategy: 'WRAP',
          textFormat: { bold, fontSize },
          borders: { top: solid, bottom: solid, left: solid, right: solid },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat,borders)',
    },
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
    const lastRow = Math.max(11, 6 + students.length); // 요약표(11행)와 명단 중 긴 쪽까지만
    const gridProperties = { rowCount: lastRow, columnCount: 9 };
    if (isFirst && p === 0) {
      requests.push({ updateSheetProperties: { properties: { sheetId: 0, title, gridProperties }, fields: 'title,gridProperties' } });
    } else {
      requests.push({ addSheet: { properties: { sheetId, title, gridProperties } } });
    }
    const sid = isFirst && p === 0 ? 0 : sheetId;

    const rows: Cell[][] = [];
    rows.push([sum.title + (sum.pages.length > 1 ? ` (${p + 1}/${sum.pages.length})` : '')]);
    rows.push([]);
    rows.push(['고사일\n고사시간', '고사실', '과목명(과목코드)', '학급', null, null, null, '인원수', '학번']);
    rows.push([sum.dateTime, sheet.roomName, sum.subjectLabel, sum.classLabel, null, null, '재적인원', sum.enrolled, null]);
    rows.push([null, null, null, null, null, null, '구분', '인원수', '학번']);
    for (let i = 0; i < lastRow - 6; i++) {
      const s = students[i];
      const left: Cell[] = s ? [p * SEAT_ROWS + i + 1, makeHakbeon(s.grade, s.ban, s.num), s.name, s.gender, null] : [null, null, null, null, null];
      // 명단 머리글은 6행, 요약표는 6~11행
      if (i === 0) rows.push(['좌석번호', '학번', '이름', '성별', '결시체크', null, ...summaryCells(sum, 0)]);
      rows.push([...left, null, ...(i + 1 < sum.rows.length ? summaryCells(sum, i + 1) : [null, null, null])]);
    }

    requests.push({
      updateCells: {
        rows: rows.map((r) => ({ values: r.map(toCell) })),
        fields: 'userEnteredValue',
        start: { sheetId: sid, rowIndex: 0, columnIndex: 0 },
      },
    });

    requests.push({ mergeCells: { range: range(sid, 0, 0, 1, 9), mergeType: 'MERGE_ALL' } });
    requests.push({
      repeatCell: {
        range: range(sid, 0, 0, 1, 9),
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { bold: true, fontSize: 20 } } },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)',
      },
    });
    requests.push(boxFormat(sid, 2, 0, 3, 4, GREEN, true));
    requests.push(boxFormat(sid, 3, 0, 4, 4));
    requests.push(boxFormat(sid, 2, 6, 3, 9, MINT, true));
    requests.push(boxFormat(sid, 3, 6, 4, 7, MINT, true));
    requests.push(boxFormat(sid, 3, 7, 4, 9));
    requests.push(boxFormat(sid, 4, 6, 5, 9, MINT, true));
    requests.push(boxFormat(sid, 5, 6, 5 + sum.rows.length, 7, MINT, true));
    requests.push(boxFormat(sid, 5, 7, 5 + sum.rows.length, 8, undefined, false, 11));
    requests.push(boxFormat(sid, 5, 8, 5 + sum.rows.length, 9, undefined, false, 8));
    requests.push(boxFormat(sid, 5, 0, 6, 5, ORANGE, true));
    if (students.length > 0) requests.push(boxFormat(sid, 6, 0, 6 + students.length, 5));
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
      [6, lastRow, 19],
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
