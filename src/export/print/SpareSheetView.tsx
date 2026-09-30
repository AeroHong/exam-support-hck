import type { SubjectRoster } from '../../core';
import { gradeTheme } from '../theme';
import { spareInfo, spareSubjectSizeMm } from '../spare';
import './roomSheet.css';

/**
 * 과목별 '여분' 표지 — A4로 출력해서 반으로 접어 여분 시험지·답안지 봉투에 넣는다.
 * 내용은 위쪽 절반(148mm)에만, 가운데에 접는 선.
 */
export function SpareSheetView({ roster }: { roster: SubjectRoster }) {
  const t = gradeTheme(roster.grade);
  const vars = { '--accent': `#${t.accent}`, '--badge-bg': `#${t.badgeBg}` } as React.CSSProperties;
  return (
    <div className="rs-page sp-page" style={vars}>
      <div className="sp-half">
        <div className="sp-info">
          <span className="rs-grade-badge">{roster.grade}</span>
          <span>{spareInfo(roster)}</span>
        </div>
        <div className="sp-subject" style={{ fontSize: `${spareSubjectSizeMm(roster.subject)}mm` }}>
          {roster.subject}
        </div>
        <div className="sp-word">여분</div>
      </div>
      <div className="sp-fold">
        <span>접는 선</span>
      </div>
    </div>
  );
}
