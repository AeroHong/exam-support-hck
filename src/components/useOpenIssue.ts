import { useNavigate } from 'react-router';
import type { IssueLink } from '../core';

/** 검증 항목 → 데이터 수정 화면의 해당 칸·행으로 이동 (주소에 위치를 담는다: 새로고침해도 유지) */
export function useOpenIssue(examId: string | null) {
  const navigate = useNavigate();
  return (link: IssueLink) => {
    if (!examId) return;
    const p = new URLSearchParams();
    if (link.kind === 'plan') {
      p.set('tab', 'plan');
      p.set('row', String(link.row));
    } else {
      p.set('tab', link.grade);
      p.set('subject', link.subject);
      if (link.hakbeon) p.set('hakbeon', link.hakbeon);
    }
    p.set('n', String(Date.now())); // 같은 항목을 다시 눌러도 다시 이동·강조
    navigate(`/exams/${examId}/edit?${p}`);
  };
}

/** 이동해 온 위치 — 편집기가 선택·강조할 대상 */
export interface EditFocus {
  nonce: string;
  row?: number; // 시험 계획 행
  subject?: string; // 과목 열(시험 계획 표기여도 됨)
  hakbeon?: string;
}
