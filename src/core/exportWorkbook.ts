import * as XLSX from 'xlsx';
import type { ParsedWorkbook } from './types';
import { cellText } from './editWorkbook';

/**
 * 수정한 데이터를 원래 엑셀 형식(N학년 응시현황 + 과목별 시험 계획)으로 되돌린다.
 * 고사실 값은 모두 텍스트 셀로 써서 "2-7"이 다시 날짜로 바뀌지 않게 한다.
 */
export function exportWorkbook(wb: ParsedWorkbook): ArrayBuffer {
  const book = XLSX.utils.book_new();

  for (const g of wb.grades) {
    const header = ['반', '번호', '이름', '성별', ...g.headers];
    const rows = g.students.map((s) => [s.ban, s.num, s.name, s.gender, ...g.headers.map((h) => cellText(s.cells[h]))]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // 고사실 칸은 텍스트 서식(@)으로 고정
    for (let r = 1; r <= rows.length; r++) {
      for (let c = 4; c < header.length; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) {
          ws[ref].t = 's';
          ws[ref].z = '@';
        }
      }
    }
    ws['!cols'] = header.map((_, i) => ({ wch: i < 2 ? 5 : i === 2 ? 9 : i === 3 ? 5 : 12 }));
    XLSX.utils.book_append_sheet(book, ws, `${g.grade} 응시현황`);
  }

  const planHeader = ['날짜', '교시', '대상학년', '과목명', '과목코드', '시험시간', '시험시간(분)'];
  const planRows = wb.plan.map((p) => [p.dateStr, p.period, p.grade, p.subject, p.code, p.timeRange, p.minutes]);
  const planWs = XLSX.utils.aoa_to_sheet([planHeader, ...planRows]);
  planWs['!cols'] = [12, 5, 8, 16, 8, 14, 12].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(book, planWs, '과목별 시험 계획');

  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
