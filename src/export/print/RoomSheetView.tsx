import type { RoomSheet } from '../../core';
import { makeHakbeon, SEAT_ROWS, seatRowHeightMm, SUMMARY_NOTES, summarize } from '../../core';
import './roomSheet.css';

const COLS = {
  head: ['27%', '17%', '34%', '22%'],
  list: ['14%', '22%', '28%', '14%', '22%'],
  sum: ['36%', '20%', '44%'],
};

function ColGroup({ widths }: { widths: string[] }) {
  return (
    <colgroup>
      {widths.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

/** 현황표 1개 = A4 1장 (대기실처럼 50명을 넘으면 여러 장) */
export function RoomSheetView({ sheet }: { sheet: RoomSheet }) {
  const sum = summarize(sheet);
  const total = sum.pages.length;
  const kindLabel = sheet.kind === 'waiting' ? '대기실 현황표' : '응시현황표';

  return (
    <>
      {sum.pages.map((students, pageIdx) => {
        const rowH = `${seatRowHeightMm(students.length)}mm`;
        return (
          <div className="rs-page" key={pageIdx}>
            <div className="rs-title">
              <span className="rs-title-room">{sheet.roomName}</span>
              <span className="rs-title-subject">{sheet.subject}</span>
              <span className="rs-title-kind">{kindLabel}</span>
              {total > 1 && (
                <span className="rs-title-page">
                  ({pageIdx + 1}/{total})
                </span>
              )}
            </div>

            <div className="rs-body">
              <div className="rs-left">
                <table className="rs-table rs-head">
                  <ColGroup widths={COLS.head} />
                  <thead>
                    <tr>
                      <th>
                        고사일
                        <br />
                        고사시간
                      </th>
                      <th>고사실</th>
                      <th>과목명(과목코드)</th>
                      <th>학급</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{sum.dateTime}</td>
                      <td className="rs-strong">{sheet.roomName}</td>
                      <td>{sum.subjectLabel}</td>
                      <td style={{ fontSize: sum.classLabel.length > 12 ? '7.5pt' : undefined }}>{sum.classLabel}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="rs-gap" />

                <table className="rs-table rs-list">
                  <ColGroup widths={COLS.list} />
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
                      <tr key={i} style={{ height: rowH }}>
                        <td className="rs-seat">{pageIdx * SEAT_ROWS + i + 1}</td>
                        <td>{makeHakbeon(s.grade, s.ban, s.num)}</td>
                        <td className="rs-name">{s.name}</td>
                        <td>{s.gender}</td>
                        <td>
                          <span className="rs-box" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rs-right">
                <table className="rs-table rs-sum">
                  <ColGroup widths={COLS.sum} />
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
                      <td className="rs-range">{sum.enrolledRange}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="rs-gap" />

                <table className="rs-table rs-sum">
                  <ColGroup widths={COLS.sum} />
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>인원수</th>
                      <th>학번</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sum.rows.map((r, i) => (
                      <tr key={r.label}>
                        <th className="rs-sub">{r.label}</th>
                        {/* 응시1교실 인원은 결시가 생기면 바뀌므로 연한 회색 */}
                        <td className={i === 0 ? 'rs-count rs-provisional' : 'rs-count'}>{r.count}</td>
                        <td>{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="rs-notes">
                  {SUMMARY_NOTES.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rs-footer">
              <span>
                {sheet.grade} · {sheet.period}교시
              </span>
              <span>
                {sheet.dateStr} {sheet.timeRange}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
