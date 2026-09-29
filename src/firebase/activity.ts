// 활동 기록 — schools/{schoolId}/activityLogs/{autoId}
// 한 번 쓰면 고치거나 지울 수 없다(firestore.rules). 기록 실패가 작업을 막지 않도록 대부분 fire-and-forget,
// 데이터 저장은 저장과 같은 batch에 넣어 "저장됐는데 기록이 없는" 경우를 없앤다.
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
  type DocumentReference,
  type QueryDocumentSnapshot,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
import { auth, db, SCHOOL_ID } from './app';
import { COL } from './schema';

export const ACTIONS = {
  login: '로그인',
  access_denied: '접근 거부',
  exam_create: '엑셀 업로드(새 자료)',
  exam_replace: '엑셀로 교체',
  exam_open: '시험 자료 열기',
  exam_save: '데이터 저장',
  exam_restore: '버전 복구',
  exam_delete: '시험 자료 삭제',
  print: '인쇄/PDF',
  export_xlsx: 'XLSX 내보내기',
  export_gsheets: 'Google 시트 내보내기',
  download_source: '수정본 엑셀 내려받기',
  member_add: '사용자 지정',
  member_role: '권한 변경',
  member_remove: '사용자 해제',
} as const;

export type ActionType = keyof typeof ACTIONS;

export interface ActivityInput {
  action: ActionType;
  examId?: string | null;
  examTitle?: string;
  summary: string; // 한 줄 설명
  details?: string[]; // 변경 내역 등 (최대 300줄)
  versionId?: string; // 이 활동으로 만들어진 데이터 버전
}

export interface ActivityLog extends ActivityInput {
  id: string;
  at?: Date;
  uid: string;
  email: string;
  name: string;
}

const logsCol = () => {
  if (!db) throw new Error('Firebase가 설정되지 않았습니다.');
  return collection(db, 'schools', SCHOOL_ID, COL.ACTIVITY_LOGS);
};

function payload(input: ActivityInput) {
  const u = auth?.currentUser;
  if (!u) throw new Error('로그인 정보가 없습니다.');
  return {
    action: input.action,
    summary: input.summary,
    details: (input.details ?? []).slice(0, 301),
    examId: input.examId ?? null,
    examTitle: input.examTitle ?? '',
    versionId: input.versionId ?? null,
    uid: u.uid,
    email: (u.email ?? '').toLowerCase(),
    name: u.displayName ?? '',
    at: serverTimestamp(),
  };
}

/** 기록 남기기 — 실패해도 작업은 계속 (콘솔에만 남김) */
export function logActivity(input: ActivityInput): void {
  if (!db || !auth?.currentUser) return;
  setDoc(doc(logsCol()), payload(input)).catch((e) => console.error('[활동 기록 실패]', input.action, e));
}

/** 저장 등과 같은 batch·transaction에 기록을 넣는다 (함께 성공하거나 함께 실패) */
export function addActivityToBatch(batch: WriteBatch | Transaction, input: ActivityInput): DocumentReference {
  const ref = doc(logsCol());
  if ('commit' in batch) batch.set(ref, payload(input));
  else batch.set(ref, payload(input));
  return ref;
}

function toLog(d: QueryDocumentSnapshot): ActivityLog {
  const v = d.data();
  return {
    id: d.id,
    action: v.action,
    summary: v.summary,
    details: v.details ?? [],
    examId: v.examId,
    examTitle: v.examTitle,
    versionId: v.versionId ?? undefined,
    uid: v.uid,
    email: v.email,
    name: v.name,
    // 막 쓴 기록은 서버 시각이 확정되기 전이라 비어 있을 수 있다 → 지금으로 표시
    at: v.at?.toDate?.() ?? new Date(),
  } as ActivityLog;
}

/** 최근 활동 실시간 구독 (최신순 n건). 반환값으로 구독 해제. */
export function subscribeRecentActivity(n: number, onChange: (logs: ActivityLog[]) => void, onError?: (e: Error) => void): () => void {
  if (!db) return () => {};
  return onSnapshot(
    query(logsCol(), orderBy('at', 'desc'), limit(n)),
    { includeMetadataChanges: false },
    (snap) => onChange(snap.docs.map(toLog)),
    (e) => onError?.(e),
  );
}

export interface ActivityFilter {
  email?: string;
  action?: ActionType;
  examId?: string;
}

export const PAGE_SIZE = 100;

/** 최신순 조회. 필터는 하나만 서버에서 걸고(복합 색인 없이), 나머지는 화면에서 거른다. */
export async function listActivity(
  filter: ActivityFilter,
  cursor?: QueryDocumentSnapshot,
): Promise<{ logs: ActivityLog[]; next?: QueryDocumentSnapshot }> {
  const conds = [];
  if (filter.examId) conds.push(where('examId', '==', filter.examId));
  else if (filter.email) conds.push(where('email', '==', filter.email));
  else if (filter.action) conds.push(where('action', '==', filter.action));
  const q = query(logsCol(), ...conds, orderBy('at', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE_SIZE));
  const snap = await getDocs(q);
  const logs = snap.docs.map(toLog);
  return { logs, next: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : undefined };
}
