// 컬렉션 이름·문서 ID 규칙의 단일 소스 — smart-teachers-office apps/shared/lib/schema.js와 같은 규칙.
// 통합할 때 그쪽 schema.js에 EXAM_ROSTER_MANAGERS 한 줄만 옮기면 된다.

export const USERS = 'users';

export const COL = {
  EXAMS: 'exams',
  GRADES: 'grades',
  VACANCIES: 'vacancies',
  /** 응시현황표 업무 담당자 — evaluationPlanManagers와 같은 패턴(문서가 있으면 담당자) */
  EXAM_ROSTER_MANAGERS: 'examRosterManagers',
} as const;

/** 이메일을 Firestore 문서 ID로 변환 (smart-teachers-office emailToDocId와 동일) */
export function emailToDocId(email: string): string {
  return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__');
}

/** 학교 관리자 역할 (smart-teachers-office firestore.rules isSchoolAdmin과 동일) */
export const ADMIN_ROLES = ['admin', 'school_admin'];
