// =====================================================================
// 응시현황표 자동 생성 시스템 (Sheets API 고속 + 도움실/별도실/대기실 처리)
//
// [고사실 유형 분류]
//   일반 고사실 : "1-1", "2-3" 등            → 응시현황표 생성
//   도움실/별도실: "도움실/1-1", "교과7/3-5"    → 소속 고사실표에 포함 + 자체 응시현황표
//   대기실      : 멀티실, 영어교과실, 토의토론실 → 대기실 현황표 생성
//   ? 소속      : "도움실/?", "교과7/?"        → 해당 과목 전체 건너뜀
//
// [양식 구조]
//   A1:H1 병합  — "(고사실) (과목명) 응시현황표"
//   A3:E3       — 고사일|고사실|과목명|응시인원|고사시간
//   G3:H3       — 도움실 응시 인원 | 별도 고사실 응시 인원
//   A4:E4, G4, H4 — 데이터
//   A6:E6       — 좌석번호|학번|이름|성별|결시체크
//   G6:H6       — 도움실 응시 학생 | 별도 고사실 응시 학생
//   A7~, G7~, H7~ — 명단
// =====================================================================

// 대기실 하드코딩
var WAITING_ROOMS = ['멀티실', '영어교과실', '토의토론실'];

// =====================================================================
// 유틸: 고사실 값 → { room, owner, unknown }
//   "1-1"        → { room: "1-1",   owner: "1-1",  unknown: false }
//   "도움실/1-1"  → { room: "도움실", owner: "1-1",  unknown: false }
//   "교과7/3-5"   → { room: "교과7",  owner: "3-5",  unknown: false }
//   "도움실/?"    → { room: "도움실", owner: "?",    unknown: true  }
//   빈값/null    → null (미응시)
// =====================================================================
function parseRoomCell(val) {
  if (val === null || val === undefined || val === '') return null;

  // Date 객체: "1-1" 형태가 엑셀에서 깨진 경우
  if (val instanceof Date) {
    var roomStr = (val.getMonth() + 1) + '-' + val.getDate();
    return { room: roomStr, owner: roomStr, unknown: false };
  }

  var str = val.toString().trim();
  if (str === '') return null;

    // ★ 추가: 당일 시험 없는 학생(하교) → 미응시와 동일하게 처리
  if (str.indexOf('하교') !== -1) return null;

  // 슬래시 포함: "도움실/1-1" 형태
  if (str.indexOf('/') !== -1) {
    var parts = str.split('/');
    var room  = parts[0].trim();
    var owner = parts[1].trim();
    return {
      room: room,
      owner: owner,
      unknown: (owner === '?' || owner === '')
    };
  }

  // 슬래시 없음: 일반 고사실 (소속 = 자기 자신)
  return { room: str, owner: str, unknown: false };
}

// 대기실 여부
function isWaitingRoom(roomName) {
  return WAITING_ROOMS.indexOf(roomName) !== -1;
}

// 일반 고사실 여부
// - "1-1", "2-7" 등 숫자-숫자 형태
// - "교과3", "교과7" 등 교과+숫자 형태
function isNormalRoom(roomName) {
  return /^\d+-\d+$/.test(roomName) || /^교과\d+$/.test(roomName);
}

// =====================================================================
// 유틸: 과목명 정규화
// =====================================================================
function normalizeSubject(str) {
  return str.toString()
    .replace(/\n/g, '').replace(/\s/g, '')
    .replace(/Ⅰ/g, '1').replace(/Ⅱ/g, '2').replace(/Ⅲ/g, '3').trim();
}

// =====================================================================
// 유틸: 학번 생성 (5자리)
// =====================================================================
function makeHakbeon(gradeStr, ban, num) {
  var g = gradeStr.replace('학년', '');
  return g + ('0' + Math.round(ban)).slice(-2) + ('0' + Math.round(num)).slice(-2);
}

// =====================================================================
// Sheets API 감지
// =====================================================================
function getSheetsAPI() {
  try {
    if (typeof Sheets === 'undefined') return null;
    if (Sheets.Spreadsheets && typeof Sheets.Spreadsheets.create === 'function')
      return Sheets.Spreadsheets;
    if (Sheets.spreadsheets && typeof Sheets.spreadsheets.create === 'function')
      return Sheets.spreadsheets;
  } catch(e) { console.warn('Sheets API 감지 실패: ' + e.message); }
  return null;
}

// =====================================================================
// 서식 헬퍼
// =====================================================================
function cellFormat(opts) {
  var fmt = {};
  if (opts.bold !== undefined || opts.fontSize !== undefined || opts.fgColor !== undefined) {
    fmt.textFormat = {};
    if (opts.bold      !== undefined) fmt.textFormat.bold     = opts.bold;
    if (opts.fontSize  !== undefined) fmt.textFormat.fontSize = opts.fontSize;
    if (opts.fgColor   !== undefined) fmt.textFormat.foregroundColor = opts.fgColor;
  }
  if (opts.bgColor !== undefined) fmt.backgroundColor = opts.bgColor;
  if (opts.halign !== undefined)  fmt.horizontalAlignment = opts.halign;
  if (opts.valign !== undefined)  fmt.verticalAlignment   = opts.valign;
  if (opts.wrap !== undefined)    fmt.wrapStrategy        = opts.wrap ? 'WRAP' : 'OVERFLOW_CELL';
  if (opts.border !== undefined) {
    var thin = { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } };
    fmt.borders = { top: thin, bottom: thin, left: thin, right: thin };
  }
  return fmt;
}

function rgb(hex) {
  return {
    red:   parseInt(hex.slice(0,2), 16) / 255,
    green: parseInt(hex.slice(2,4), 16) / 255,
    blue:  parseInt(hex.slice(4,6), 16) / 255
  };
}

function rangeOf(sheetId, r1, c1, r2, c2) {
  return { sheetId: sheetId, startRowIndex: r1, endRowIndex: r2,
           startColumnIndex: c1, endColumnIndex: c2 };
}

// =====================================================================
// 시트 1장 분량의 batchUpdate request 생성
//
// roomData: {
//   roomName,         // 고사실명
//   isWaiting,        // 대기실 여부 (제목만 달라짐)
//   mainStudents,     // 일반 응시 학생 배열
//   doumStudents,     // 도움실 응시 학생 배열 (G열)
//   extraStudents     // 별도 고사실 응시 학생 배열 (H열)
// }
// info: { dateStr, subjectStr, code, timeRange, gradeStr }
// =====================================================================
function buildSheetRequests(sheetId, info, roomData) {
  var requests = [];
  var title    = roomData.isWaiting ? '대기실 현황표' : '응시현황표';

  var mainStudents  = roomData.mainStudents  || [];
  var doumStudents  = roomData.doumStudents  || [];
  var extraStudents = roomData.extraStudents || [];
  var nMain         = mainStudents.length;
  var nDoum         = doumStudents.length;
  var nExtra        = extraStudents.length;

  // 재적 인원 = 일반응시 + 도움실 + 별도실
  var totalEnrolled = nMain + nDoum + nExtra;

  // 좌석 수 (명단 표시용 최대 행수)
  var maxListRows = Math.max(nMain, nDoum, nExtra);

  // ── 1. 시트 이름 변경 ──────────────────────────────────────────
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: sheetId, title: roomData.roomName },
      fields: 'title'
    }
  });

  // ── 2. 셀 데이터 입력 ──────────────────────────────────────────
  var allRows = [];

  // 행1: 제목 (A1:H1 병합)
  allRows.push([roomData.roomName + '  ' + info.subjectStr + '  ' + title]);

  // 행2: 빈행
  allRows.push([]);

  // 행3: 헤더 레이블 (A3:E3 + G3:H3)
  allRows.push(['고사일\n고사시간', '고사실', '과목명(과목코드)', '재적인원', '응시인원', null, '도움실 응시 인원', '별도 고사실 응시 인원']);

  // 행4: 데이터 (A4:E4 + G4:H4)
  //   A4: 고사일 + 줄바꿈 + 고사시간
  //   D4: 재적인원 (일반+도움실+별도실)
  //   E4: 응시인원 (일반 응시만)
  allRows.push([
    info.dateStr + '\n' + info.timeRange,
    roomData.roomName,
    info.subjectStr + '(' + Math.round(info.code) + ')',
    totalEnrolled,
    nMain,
    null,
    nDoum,
    nExtra
  ]);

  // 행5: 빈행
  allRows.push([]);

  // 행6: 헤더 레이블 (A6:E6 + G6:H6)
  allRows.push(['좌석번호', '학번', '이름', '성별', '결시체크', null, '도움실 응시 학생', '별도 고사실 응시 학생']);

  // 행7~: 명단
  for (var i = 0; i < maxListRows; i++) {
    var row = [];
    // A~E: 일반 응시 학생
    if (i < nMain) {
      var s = mainStudents[i];
      row.push(i + 1);
      row.push(makeHakbeon(info.gradeStr, s.ban, s.num));
      row.push(s.name);
      row.push(s.gender);
      row.push(null); // E열: 체크박스는 별도 처리
    } else {
      row.push(null, null, null, null, null);
    }
    row.push(null); // F열 빈칸

    // G: 도움실 학생 (학번 이름 성별)
    if (i < nDoum) {
      var d = doumStudents[i];
      row.push(makeHakbeon(info.gradeStr, d.ban, d.num) + ' ' + d.name + ' ' + d.gender);
    } else {
      row.push(null);
    }

    // H: 별도 고사실 학생
    if (i < nExtra) {
      var e = extraStudents[i];
      row.push(makeHakbeon(info.gradeStr, e.ban, e.num) + ' ' + e.name + ' ' + e.gender);
    } else {
      row.push(null);
    }

    allRows.push(row);
  }

  requests.push({
    updateCells: {
      rows: allRows.map(function(row) {
        return {
          values: row.map(function(cell) {
            if (cell === null || cell === undefined) return {};
            return { userEnteredValue: typeof cell === 'number'
              ? { numberValue: cell }
              : { stringValue: String(cell) } };
          })
        };
      }),
      fields: 'userEnteredValue',
      start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 }
    }
  });

  // ── 3. 서식 ────────────────────────────────────────────────────

  // 행1: A1:H1 병합 + 중앙 정렬
  requests.push({ mergeCells: {
    range: rangeOf(sheetId, 0, 0, 1, 8),
    mergeType: 'MERGE_ALL'
  }});
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 0, 0, 1, 8),
    cell: { userEnteredFormat: cellFormat({ bold: true, fontSize: 22, halign: 'CENTER', valign: 'MIDDLE' }) },
    fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
  }});

  // 행3: A3:E3 헤더 (녹색)
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 2, 0, 3, 5),
    cell: { userEnteredFormat: cellFormat({
      bold: true, bgColor: rgb('D9EAD3'),
      halign: 'CENTER', valign: 'MIDDLE', border: true }) },
    fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,borders)'
  }});

  // A3: 고사일/고사시간 줄바꿈 처리를 위한 wrap 추가
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 2, 0, 3, 1),
    cell: { userEnteredFormat: cellFormat({ wrap: true }) },
    fields: 'userEnteredFormat.wrapStrategy'
  }});

  // 행3: G3:H3 헤더 (녹색)
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 2, 6, 3, 8),
    cell: { userEnteredFormat: cellFormat({
      bold: true, bgColor: rgb('D9EAD3'),
      halign: 'CENTER', valign: 'MIDDLE', border: true }) },
    fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,borders)'
  }});

  // 행4: A4:E4 데이터
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 3, 0, 4, 5),
    cell: { userEnteredFormat: cellFormat({ halign: 'CENTER', valign: 'MIDDLE', border: true }) },
    fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,borders)'
  }});

  // A4: 고사일/고사시간 줄바꿈 처리를 위한 wrap 추가
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 3, 0, 4, 1),
    cell: { userEnteredFormat: cellFormat({ wrap: true }) },
    fields: 'userEnteredFormat.wrapStrategy'
  }});

  // 행4: G4:H4 데이터
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 3, 6, 4, 8),
    cell: { userEnteredFormat: cellFormat({ halign: 'CENTER', valign: 'MIDDLE', border: true }) },
    fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,borders)'
  }});

  // 행6: A6:E6 헤더 (주황)
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 5, 0, 6, 5),
    cell: { userEnteredFormat: cellFormat({
      bold: true, bgColor: rgb('FCE5CD'),
      halign: 'CENTER', valign: 'MIDDLE', border: true }) },
    fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,borders)'
  }});

  // 행6: G6:H6 헤더 (주황)
  requests.push({ repeatCell: {
    range: rangeOf(sheetId, 5, 6, 6, 8),
    cell: { userEnteredFormat: cellFormat({
      bold: true, bgColor: rgb('FCE5CD'),
      halign: 'CENTER', valign: 'MIDDLE', border: true }) },
    fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment,verticalAlignment,borders)'
  }});

  // 행7~ 명단 영역 전체 테두리 + 중앙정렬
  if (maxListRows > 0) {
    // A~E (일반 응시)
    if (nMain > 0) {
      requests.push({ repeatCell: {
        range: rangeOf(sheetId, 6, 0, 6 + nMain, 5),
        cell: { userEnteredFormat: cellFormat({ halign: 'CENTER', valign: 'MIDDLE', border: true }) },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,borders)'
      }});
    }
    // G~H (도움실/별도실)
    var ghEnd = Math.max(nDoum, nExtra);
    if (ghEnd > 0) {
      requests.push({ repeatCell: {
        range: rangeOf(sheetId, 6, 6, 6 + ghEnd, 8),
        cell: { userEnteredFormat: cellFormat({ halign: 'CENTER', valign: 'MIDDLE', border: true }) },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,borders)'
      }});
    }
  }

  // ── 4. 행 높이 ─────────────────────────────────────────────────
  var rowHeights = [
    { start: 0, end: 1, height: 40 },
    { start: 2, end: 4, height: 48 },  // 행3·4: 줄바꿈 공간 확보
    { start: 5, end: 6, height: 33 }
  ];
  if (maxListRows > 0) {
    rowHeights.push({ start: 6, end: 6 + maxListRows, height: 35 });
  }
  rowHeights.forEach(function(rh) {
    requests.push({ updateDimensionProperties: {
      range: { sheetId: sheetId, dimension: 'ROWS', startIndex: rh.start, endIndex: rh.end },
      properties: { pixelSize: rh.height },
      fields: 'pixelSize'
    }});
  });

  // ── 5. 열 너비 ────────────────────────────────────────────────
  // C열(100), F열(30 - 구분용 좁게), G열(130), H열(150)
  var colWidths = [
    { col: 2, width: 100 },  // C열
    { col: 5, width: 30  },  // F열
    { col: 6, width: 130 },  // G열
    { col: 7, width: 150 }   // H열
  ];
  colWidths.forEach(function(cw) {
    requests.push({ updateDimensionProperties: {
      range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: cw.col, endIndex: cw.col + 1 },
      properties: { pixelSize: cw.width },
      fields: 'pixelSize'
    }});
  });

  // ── 6. 결시체크 체크박스 (E열) ─────────────────────────────────
  if (nMain > 0) {
    requests.push({ setDataValidation: {
      range: rangeOf(sheetId, 6, 4, 6 + nMain, 5),
      rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true }
    }});
  }

  return requests;
}

// =====================================================================
// 파일 생성 (Sheets API)
// =====================================================================
function createFileWithSheetsAPI(sheetsApi, folder, fileName, info, roomOrder, roomsData) {
  var sheetsResource = roomOrder.map(function(roomName, idx) {
    return { properties: { sheetId: idx, title: 'sheet' + idx, index: idx } };
  });

  var newSpreadsheet = sheetsApi.create({
    properties: { title: fileName },
    sheets: sheetsResource
  });

  var spreadsheetId = newSpreadsheet.spreadsheetId;
  var createdSheets = newSpreadsheet.sheets;

  var file = DriveApp.getFileById(spreadsheetId);
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  var allRequests = [];
  roomOrder.forEach(function(roomName, idx) {
    var realSheetId = createdSheets[idx].properties.sheetId;
    var roomData    = roomsData[roomName];
    // 반 → 번호 정렬 (각 카테고리별)
    ['mainStudents', 'doumStudents', 'extraStudents'].forEach(function(key) {
      if (roomData[key]) {
        roomData[key].sort(function(a, b) {
          return a.ban !== b.ban ? a.ban - b.ban : a.num - b.num;
        });
      }
    });
    roomData.roomName = roomName;
    allRequests = allRequests.concat(buildSheetRequests(realSheetId, info, roomData));
  });

  sheetsApi.batchUpdate({ requests: allRequests }, spreadsheetId);
  return roomOrder.length;
}

// =====================================================================
// 메뉴 / 사이드바 / 폴더ID / 래퍼
// =====================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📝 응시현황 자동화')
    .addItem('사이드바 열기', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('응시현황표 제작 시스템').setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function saveFolderId(folderId) {
  PropertiesService.getDocumentProperties().setProperty('TARGET_FOLDER_ID', folderId);
  return '폴더 ID가 성공적으로 저장되었습니다.';
}

function getFolderId() {
  return PropertiesService.getDocumentProperties().getProperty('TARGET_FOLDER_ID') || '';
}

function generateAll()           { return processGeneration('ALL',     ''); }
function generateBySubject(name) { return processGeneration('SUBJECT', name.trim()); }
function generateByRoom(room)    { return processGeneration('ROOM',    room.trim()); }
function generateByDate(date)    { return processGeneration('DATE',    date.trim()); }
function generateByGrade(grade)  { return processGeneration('GRADE',   grade.trim()); }

// =====================================================================
// 사이드바: 시험 계획에서 날짜·과목 목록 추출
// =====================================================================
function getPlanOptions() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var planSheet = ss.getSheetByName('과목별 시험 계획');
  if (!planSheet) throw new Error("'과목별 시험 계획' 시트 없음");

  var data = planSheet.getDataRange().getValues();
  data.shift();

  var dateSet    = {};
  var subjectSet = {};
  var dates      = [];
  var subjects   = [];

  data.forEach(function(plan) {
    var dateVal   = plan[0];
    var subject   = plan[3];

    // 날짜
    var dateStr = (dateVal instanceof Date)
      ? Utilities.formatDate(dateVal, 'GMT+9', 'yyyy-MM-dd')
      : dateVal.toString();
    if (!dateSet[dateStr]) { dateSet[dateStr] = true; dates.push(dateStr); }

    // 과목
    var subjectStr = subject.toString().trim();
    if (!subjectSet[subjectStr]) { subjectSet[subjectStr] = true; subjects.push(subjectStr); }
  });

  dates.sort();
  subjects.sort();

  return { dates: dates, subjects: subjects };
}

// =====================================================================
// 핵심 실행 함수
// =====================================================================
function processGeneration(mode, filterValue) {

  var LOG = [];
  function log(msg)    { console.log(msg);   LOG.push(msg); }
  function warn(msg)   { console.warn(msg);  LOG.push('⚠️ ' + msg); }
  function logErr(msg) { console.error(msg); LOG.push('❌ ' + msg); }

  var sheetsApi = getSheetsAPI();
  if (!sheetsApi) throw new Error('Sheets API가 활성화되지 않았습니다. Apps Script 편집기에서 서비스로 추가해주세요.');

  log('=== 응시현황표 제작 시작 (⚡ Sheets API 고속 모드) ===');

  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var folderId  = getFolderId();
  var planSheet = ss.getSheetByName('과목별 시험 계획');

  if (!folderId)  throw new Error('저장 폴더 ID가 설정되지 않았습니다.');
  if (!planSheet) throw new Error("'과목별 시험 계획' 시트를 찾을 수 없습니다.");

  var folder = DriveApp.getFolderById(folderId);

  // 학년별 데이터 로드
  var gradeDataMap = {};
  ['1학년', '2학년', '3학년'].forEach(function(grade) {
    var sheet = ss.getSheetByName(grade + ' 응시현황');
    if (!sheet) { warn(grade + ' 응시현황 시트 없음'); return; }
    var raw = sheet.getDataRange().getValues();
    gradeDataMap[grade] = {
      header: raw[0].map(function(h) { return normalizeSubject(h.toString()); }),
      rows:   raw.slice(1)
    };
    log('[로드] ' + grade + ': ' + (raw.length - 1) + '명');
  });

  // 시험 계획 로드
  var planData = planSheet.getDataRange().getValues();
  planData.shift();

  // 과목별 데이터 수집
  var subjectMap   = {};
  var subjectOrder = [];

  planData.forEach(function(plan) {
    var dateVal = plan[0], period = plan[1], grade = plan[2],
        subject = plan[3], code   = plan[4], timeRange = plan[5];

    var gradeStr    = grade.toString().trim();
    var subjectStr  = subject.toString().trim();
    var subjectNorm = normalizeSubject(subjectStr);

    if (mode === 'SUBJECT' && normalizeSubject(filterValue) !== subjectNorm) return;
    if (mode === 'GRADE'   && filterValue !== gradeStr) return;

    var dateStr = (dateVal instanceof Date)
      ? Utilities.formatDate(dateVal, 'GMT+9', 'yyyy-MM-dd')
      : dateVal.toString();

    if (mode === 'DATE' && filterValue !== dateStr) return;

    var mapKey    = dateStr + '|' + period + '|' + gradeStr + '|' + subjectStr;
    var gradeData = gradeDataMap[gradeStr];
    if (!gradeData) { logErr(gradeStr + ' 데이터 없음'); return; }

    var colIdx = gradeData.header.indexOf(subjectNorm);
    if (colIdx === -1) {
      logErr('[' + gradeStr + '] "' + subjectStr + '" 열 없음 | 헤더: ' + gradeData.header.slice(4).join(', '));
      return;
    }

    if (!subjectMap[mapKey]) {
      subjectMap[mapKey] = {
        dateStr: dateStr, period: period, gradeStr: gradeStr,
        subjectStr: subjectStr, code: code, timeRange: timeRange,
        rooms: {},        // 일반 고사실: { "1-1": {mainStudents, doumStudents, extraStudents} }
        waitingRooms: {}, // 대기실: { "멀티실": {mainStudents} }
        specialRooms: {}, // 도움실/별도실 자체 응시현황: { "도움실": [학생들], "교과7": [학생들] }
        unknownStudents: [] // ? 소속 학생
      };
      subjectOrder.push(mapKey);
    }

    var subj = subjectMap[mapKey];
    var skipThisSubject = false;

    gradeData.rows.forEach(function(row) {
      var parsed = parseRoomCell(row[colIdx]);
      if (!parsed) return;

      // 고사실 필터 (모드 ROOM일 때)
      if (mode === 'ROOM') {
        // 필터 값이 실제 시험보는 고사실 또는 소속 고사실 둘 중 하나라도 일치
        if (parsed.room !== filterValue && parsed.owner !== filterValue) return;
      }

      var student = { ban: row[0], num: row[1], name: row[2], gender: row[3] };

      // ? 소속: 경고 리스트에 추가
      if (parsed.unknown) {
        subj.unknownStudents.push({
          name: student.name,
          ban: student.ban,
          num: student.num,
          room: parsed.room
        });
        skipThisSubject = true;
        return;
      }

      var room  = parsed.room;
      var owner = parsed.owner;

      // 대기실 여부 판별 (하드코딩 대기실 or 도움실/대기 형태)
      if (isWaitingRoom(room) || owner === '대기') {
        var waitKey = isWaitingRoom(room) ? room : room + '(대기)';
        if (!subj.waitingRooms[waitKey]) subj.waitingRooms[waitKey] = { mainStudents: [] };
        subj.waitingRooms[waitKey].mainStudents.push(student);
        return;
      }

      // 일반 고사실 (room === owner, 숫자-숫자 or 교과N 형태)
      if (room === owner && isNormalRoom(room)) {
        if (!subj.rooms[room]) subj.rooms[room] = { mainStudents: [], doumStudents: [], extraStudents: [] };
        subj.rooms[room].mainStudents.push(student);
        return;
      }

      // 슬래시 없는 단독 도움실 → 도움실 자체가 고사실 (specialRoom)
      if (room === owner && room === '도움실') {
        if (!subj.specialRooms[room]) subj.specialRooms[room] = [];
        subj.specialRooms[room].push(student);
        return;
      }

      // 도움실/별도실: 소속 고사실의 doum/extra에 추가 + 자체 응시현황에도 추가
      if (room === '도움실') {
        if (!subj.rooms[owner]) subj.rooms[owner] = { mainStudents: [], doumStudents: [], extraStudents: [] };
        subj.rooms[owner].doumStudents.push(student);
      } else {
        // 교과7, 기타 별도실
        if (!subj.rooms[owner]) subj.rooms[owner] = { mainStudents: [], doumStudents: [], extraStudents: [] };
        subj.rooms[owner].extraStudents.push(student);
      }

      // 도움실/별도실 자체 응시현황표
      if (!subj.specialRooms[room]) subj.specialRooms[room] = [];
      subj.specialRooms[room].push(student);
    });

    // ? 학생이 있으면 건너뛰기 플래그
    if (skipThisSubject) subj._skip = true;

    log('[계획] ' + dateStr + ' ' + period + '교시 | ' + gradeStr + ' | ' + subjectStr);
  });

  // 파일 생성
  var fileCount = 0, sheetCount = 0, errors = [], skippedSubjects = [];
  log('\n=== 파일 생성 시작 ===');

  subjectOrder.forEach(function(mapKey) {
    var info = subjectMap[mapKey];

    // ? 학생 있는 과목 건너뛰기
    if (info._skip) {
      var unknownList = info.unknownStudents.map(function(u) {
        return '[' + info.gradeStr + '] ' + u.name + ' (' + u.room + '/?)';
      }).join(', ');
      warn('[건너뜀-소속미확인] ' + info.subjectStr + ': ' + unknownList);
      skippedSubjects.push({
        subject: info.subjectStr,
        grade: info.gradeStr,
        date: info.dateStr,
        period: info.period,
        unknowns: info.unknownStudents
      });
      return;
    }

    // 고사실별 데이터 통합 (일반 + 대기실 + 도움실/별도실 자체)
    var roomsData = {};
    var roomOrder = [];

    // 1. 일반 고사실
    Object.keys(info.rooms).sort().forEach(function(roomName) {
      roomsData[roomName] = info.rooms[roomName];
      roomsData[roomName].isWaiting = false;
      roomOrder.push(roomName);
    });

    // 2. 도움실/별도실 자체 응시현황 (재적 전원이 도움실/별도실 학생들)
    Object.keys(info.specialRooms).sort().forEach(function(roomName) {
      roomsData[roomName] = {
        mainStudents:  info.specialRooms[roomName],
        doumStudents:  [],
        extraStudents: [],
        isWaiting: false
      };
      roomOrder.push(roomName);
    });

    // 3. 대기실
    Object.keys(info.waitingRooms).sort().forEach(function(roomName) {
      roomsData[roomName] = {
        mainStudents:  info.waitingRooms[roomName].mainStudents,
        doumStudents:  [],
        extraStudents: [],
        isWaiting: true
      };
      roomOrder.push(roomName);
    });

    if (roomOrder.length === 0) {
      warn('[건너뜀] ' + info.subjectStr + ': 배정 학생 없음');
      return;
    }

    var fileName = info.dateStr + '_' + info.gradeStr + '_' + info.period + '교시_' + info.subjectStr;
    log('\n[파일] ' + fileName + ' | ' + roomOrder.length + '실: ' + roomOrder.join(', '));

    try {
      var created = createFileWithSheetsAPI(sheetsApi, folder, fileName, info, roomOrder, roomsData);
      sheetCount += created;
      fileCount++;
      log('  📄 완료');
    } catch(e) {
      logErr('실패 [' + info.subjectStr + ']: ' + e.message);
      errors.push(info.subjectStr + ': ' + e.message);
    }
  });

  // 결과 메시지
  var result = '✅ ' + fileCount + '개 파일, ' + sheetCount + '개 시트 생성 완료\n\n';

  result += '📋 과목별 현황:\n';
  subjectOrder.forEach(function(mapKey) {
    var info = subjectMap[mapKey];
    if (info._skip) {
      result += '⏸️  ' + info.dateStr + ' ' + info.period + '교시 | ' + info.gradeStr + ' | '
              + info.subjectStr + ' — 소속 미확인으로 건너뜀\n';
    } else {
      var totalRooms = Object.keys(info.rooms).length
                     + Object.keys(info.specialRooms).length
                     + Object.keys(info.waitingRooms).length;
      var totalStudents = 0;
      Object.keys(info.rooms).forEach(function(r) {
        totalStudents += info.rooms[r].mainStudents.length
                       + info.rooms[r].doumStudents.length
                       + info.rooms[r].extraStudents.length;
      });
      result += '✅ ' + info.dateStr + ' ' + info.period + '교시 | ' + info.gradeStr + ' | '
              + info.subjectStr + ' — ' + totalRooms + '실 ' + totalStudents + '명\n';
    }
  });

  if (skippedSubjects.length > 0) {
    result += '\n⚠️ 소속 미확인으로 건너뛴 과목 (' + skippedSubjects.length + '개):\n';
    skippedSubjects.forEach(function(sk) {
      result += '  • ' + sk.grade + ' ' + sk.subject + '\n';
      sk.unknowns.forEach(function(u) {
        result += '     └ ' + u.name + ' (' + u.room + '/?)\n';
      });
    });
    result += '\n💡 해결 후 "특정 과목만 제작"으로 재실행하세요.\n';
  }

  if (errors.length > 0) result += '\n❌ 오류 ' + errors.length + '건:\n' + errors.join('\n');

  return result;
}
