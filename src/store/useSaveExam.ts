import { useState } from 'react';
import { diffWorkbook } from '../core';
import { auth, firebaseConfigured } from '../firebase/app';
import { loadVersionData, saveExam, type ExamData, type VersionMeta } from '../firebase/repo';
import { useExamStore } from './examStore';

const whoAmI = (email: string) => ({ by: email, byName: auth?.currentUser?.displayName ?? email });

/**
 * 시험 자료 저장·버전 복구.
 * 저장할 때마다 새 버전(전체 데이터)을 만들고, 마지막 저장본과 비교한 변경 내역을
 * 버전·활동 기록에 함께 남긴다(모두 한 batch — 함께 성공하거나 함께 실패).
 */
export function useSaveExam(userEmail: string) {
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<string> => {
    const { workbook, title, sourceFileName, vacancies, examId, saved, version, markSaved } = useExamStore.getState();
    if (!workbook || !examId) throw new Error('저장할 자료가 없습니다.');
    if (!firebaseConfigured) {
      markSaved(examId);
      return '로컬 모드에서는 서버에 저장하지 않습니다.';
    }
    const diff = diffWorkbook(saved?.workbook ?? null, workbook, {
      prevTitle: saved?.title,
      nextTitle: title,
      prevVacancies: saved?.vacancies,
      nextVacancies: vacancies,
    });
    if (saved && diff.count === 0) {
      markSaved(examId);
      return '변경한 내용이 없습니다.';
    }
    setSaving(true);
    try {
      const res = await saveExam(examId, { title, sourceFileName, workbook, vacancies }, {
        ...whoAmI(userEmail),
        action: 'exam_save',
        summary: diff.summary,
        details: diff.lines,
        version,
        // 버전 기록을 시작하기 전 자료면, 직전 저장본을 v1로 남겨 두어 언제든 돌아갈 수 있게 한다
        baseline: saved ? { title: saved.title, sourceFileName, workbook: saved.workbook, vacancies: saved.vacancies } : undefined,
      });
      markSaved(examId, res);
      return `v${res.versionCount}로 저장했습니다 — ${diff.summary}`;
    } finally {
      setSaving(false);
    }
  };

  /** 골라 둔 버전의 데이터로 되돌린다 — 기존 버전은 그대로 두고, 복구한 상태를 새 버전으로 저장 */
  const restore = async (target: VersionMeta): Promise<string> => {
    const { examId, saved, version, openExam } = useExamStore.getState();
    if (!examId || !firebaseConfigured) throw new Error('저장된 시험 자료가 아닙니다.');
    setSaving(true);
    try {
      const data: ExamData = await loadVersionData(examId, target.id);
      const diff = diffWorkbook(saved?.workbook ?? null, data.workbook, {
        prevTitle: saved?.title,
        nextTitle: data.title,
        prevVacancies: saved?.vacancies,
        nextVacancies: data.vacancies,
      });
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
    } finally {
      setSaving(false);
    }
  };

  return { save, restore, saving };
}
