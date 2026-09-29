import { useState } from 'react';
import { diffWorkbook } from '../core';
import { firebaseConfigured } from '../firebase/app';
import { saveExam } from '../firebase/repo';
import { useExamStore } from './examStore';

/**
 * 현재 시험 자료 저장 — 마지막 저장본과 비교한 변경 내역을 활동 기록에 함께 남긴다
 * (저장과 기록은 한 batch라 함께 성공하거나 함께 실패).
 */
export function useSaveExam(userEmail: string) {
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<string> => {
    const { workbook, title, sourceFileName, vacancies, examId, saved, markSaved } = useExamStore.getState();
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
      await saveExam(examId, { title, sourceFileName, workbook, vacancies }, userEmail, (id) => ({
        action: 'exam_save',
        examId: id,
        examTitle: title,
        summary: diff.summary,
        details: diff.lines,
      }));
      markSaved(examId);
      return `저장했습니다 — ${diff.summary}`;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}
