import type { RoomSheet } from '../../core';
import { makeHakbeon, SEAT_ROWS, summarize } from '../../core';
import './roomSheet.css';

/** 현황표 1개 = A4 1장 (대기실처럼 50명을 넘으면 여러 장) */
export function RoomSheetView({ sheet }: { sheet: RoomSheet }) {
  const sum = summarize(sheet);
  const total = sum.pages.length;

  return (
    <>
      {sum.pages.map((students, pageIdx) => (
        <div className="rs-page" key={pageIdx}>
          <div className="rs-title">
            {sum.title}
            {total > 1 && <small> ({pageIdx + 1}/{total})</small>}
          </div>

          <div className="rs-body">
            <div className="rs-left">
              <table className="rs-table rs-head">
                <colgroup>
                  <col style={{ width: '27%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '33%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>고사일<br />고사시간</th>
                    <th>고사실</th>
                    <th>과목명(과목코드)</th>
                    <th>학급</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{sum.dateTime}</td>
                    <td>{sheet.roomName}</td>
                    <td>{sum.subjectLabel}</td>
                    <td style={{ fontSize: sum.classLabel.length > 12 ? '7.5pt' : undefined }}>{sum.classLabel}</td>
                  </tr>
                </tbody>
              </table>

              <div className="rs-gap" />

              <table className="rs-table rs-list">
                <colgroup>
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>좌석번호</th>
                    <th>학번</th>
                    <th>이름</th>
                    <th>성별</th>
                    <th>결시체크</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 응시 인원만큼만 행을 그린다 (빈 좌석 행 없음) */}
                  {students.map((s, i) => (
                    <tr key={i}>
                      <td>{pageIdx * SEAT_ROWS + i + 1}</td>
                      <td>{makeHakbeon(s.grade, s.ban, s.num)}</td>
                      <td>{s.name}</td>
                      <td>{s.gender}</td>
                      <td>☐</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rs-right">
              <table className="rs-table rs-sum">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '44%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th>인원수</th>
                    <th>학번</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="rs-sub">재적인원</th>
                    <td className="rs-count">{sum.enrolled}</td>
                    <td />
                  </tr>
                </tbody>
              </table>

              <div className="rs-gap" />

              <table className="rs-table rs-sum">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '44%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>인원수</th>
                    <th>학번</th>
                  </tr>
                </thead>
                <tbody>
                  {sum.rows.map((r) => (
                    <tr key={r.label}>
                      <th className="rs-sub">{r.label}</th>
                      <td className="rs-count">{r.count}</td>
                      <td>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rs-footer">
            {sheet.grade} · {sheet.period}교시
          </div>
        </div>
      ))}
    </>
  );
}
