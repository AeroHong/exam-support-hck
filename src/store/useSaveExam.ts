import { useState } from 'react';
import { diffWorkbook, mergeWorkbook } from '../core';
import { auth, firebaseConfigured } from '../firebase/app';
import { loadExam, loadVersionData, saveExam, SaveConflictError, type ExamData, type VersionMeta } from '../firebase/repo';
import { useExamStore } from './examStore';

const whoAmI = (email: string) => ({ by: email, byName: auth?.currentUser?.displayName ?? email });

export interface SaveOutcome {
  message: string;
  /** 다른 사람과 같은 칸을 다르게 고쳐 최신본을 남긴 곳 — 확인 후 다시 저장해야 함 */
  conflicts?: string[];
}

const MAX_MERGE_RETRY = 3;

/**
 * 시험 자료 저장·버전 복구.
 * - 저장할 때마다 새 버전(전체 데이터)과 변경 내역을 버전·활동 기록에 함께 남긴다(한 transaction).
 * - 내가 연 뒤 다른 사람이 먼저 저장했으면 덮어쓰지 않고, 최신본 위에 내 변경을 합쳐(3-way) 다시 저장한다.
 *   같은 칸을 둘이 다르게 고친 경우만 멈추고 알린다.
 */
export function useSaveExam(userEmail: string) {
  const [saving, setSaving] = useState(false);

  const saveOnce = async (note = ''): Promise<string> => {
    const { workbook, title, sourceFileName, vacancies, examId, saved, version, markSaved } = useExamStore.getState();
    if (!workbook || !examId) throw new Error('저장할 자료가 없습니다.');
    const diff = diffWorkbook(saved?.workbook ?? null, workbook, {
      prevTitle: saved?.title,
      nextTitle: title,
      prevVacancies: saved?.vacancies,
      nextVacancies: vacancies,
    });
    if (saved && diff.count === 0) {
      markSaved(examId);
      return note ? `${note} 합친 뒤 바뀐 내용이 없어 저장하지 않았습니다.` : '변경한 내용이 없습니다.';
    }
    const res = await saveExam(examId, { title, sourceFileName, workbook, vacancies }, {
      ...whoAmI(userEmail),
      action: 'exam_save',
      summary: note ? `${diff.summary} (${note})` : diff.summary,
      details: diff.lines,
      version,
      // 버전 기록을 시작하기 전 자료면, 직전 저장본을 v1로 남겨 두어 언제든 돌아갈 수 있게 한다
      baseline: saved ? { title: saved.title, sourceFileName, workbook: saved.workbook, vacancies: saved.vacancies } : undefined,
    });
    markSaved(examId, res);
    return `v${res.versionCount}로 저장했습니다 — ${diff.summary}${note ? ` (${note})` : ''}`;
  };

  const save = async (): Promise<SaveOutcome> => {
    const store = useExamStore.getState();
    if (!store.workbook || !store.examId) throw new Error('저장할 자료가 없습니다.');
    if (!firebaseConfigured) {
      store.markSaved(store.examId);
      return { message: '로컬 모드에서는 서버에 저장하지 않습니다.' };
    }
    setSaving(true);
    store.setSaving(true);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return { message: await saveOnce(attempt ? `다른 선생님의 최신 저장본과 합쳐 저장` : '') };
        } catch (e) {
          if (!(e instanceof SaveConflictError) || attempt >= MAX_MERGE_RETRY) throw e;
          // 최신본을 받아 그 위에 내 변경을 다시 적용한다
          const s = useExamStore.getState();
          const latest = await loadExam(s.examId!);
          const base = s.saved ?? { workbook: latest.workbook, title: latest.title, vacancies: latest.vacancies };
          const merged = mergeWorkbook(base, { workbook: s.workbook!, title: s.title, vacancies: s.vacancies }, latest);
          s.rebase(latest, merged);
          if (merged.conflicts.length) {
            return {
              message: `${e.byName || '다른 선생님'}님이 먼저 저장한 v${latest.versionCount}에 내 변경 ${merged.applied}건을 합쳤습니다. 같은 칸을 서로 다르게 고친 ${merged.conflicts.length}곳은 최신본 값을 남겼습니다 — 확인 후 다시 저장하세요.`,
              conflicts: merged.conflicts,
            };
          }
        }
      }
    } finally {
      setSaving(false);
      useExamStore.getState().setSaving(false);
    }
  };

  /** 골라 둔 버전의 데이터로 되돌린다 — 기존 버전은 그대로 두고, 복구한 상태를 새 버전으로 저장 */
  const restore = async (target: VersionMeta): Promise<string> => {
    const { examId, saved, version, openExam, setSaving: setStoreSaving } = useExamStore.getState();
    if (!examId || !firebaseConfigured) throw new Error('저장된 시험 자료가 아닙니다.');
    setSaving(true);
    setStoreSaving(true);
    try {
      const data: ExamData = await loadVersionData(examId, target.id);
      const diff = diffWorkbook(saved?.workbook ?? null, data.workbook, {
        prevTitle: saved?.title,
        nextTitle: data.title,
        prevVacancies: saved?.vacancies,
        nextVacancies: data.vacancies,
      });
      try {
        const res = await saveExam(examId, data, {
          ...whoAmI(userEmail),
          action: 'exam_restore',
          summary: `v${target.versionNo}(으)로 복구 — ${diff.summary}`,
          details: diff.lines,
          version,
          baseline: saved ? { title: saved.title, sourceFileName: data.sourceFileName, workbook: saved.workbook, vacancies: saved.vacancies } : undefined,
        });
        openExam(examId, { ...data, ...res });
        return `v${target.versionNo}(으)로 복구해서 v${res.versionCount}로 저장했습니다 — ${diff.summary}`;
      } catch (e) {
        if (!(e instanceof SaveConflictError)) throw e;
        // 복구는 의도적인 작업이라 자동으로 합치지 않는다 — 최신본을 보여주고 다시 고르게 한다
        const latest = await loadExam(examId);
        openExam(examId, latest);
        throw new Error(`${e.message} 최신본(v${latest.versionCount})을 불러왔습니다. 확인 후 다시 복구하세요.`);
      }
    } finally {
      setSaving(false);
      setStoreSaving(false);
    }
  };

  return { save, restore, saving };
}
