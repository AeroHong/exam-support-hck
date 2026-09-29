import { useState } from 'react';
import { saveExam } from '../firebase/repo';
import { useExamStore } from './examStore';

/** 현재 작업 중인 시험 자료를 Firestore에 저장 (응시현황표·데이터 수정 화면 공통) */
export function useSaveExam(createdBy: string) {
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<string> => {
    const { workbook, title, sourceFileName, examId, markSaved } = useExamStore.getState();
    if (!workbook) throw new Error('저장할 자료가 없습니다.');
    setSaving(true);
    try {
      const id = (examId ?? title).replace(/\//g, '_').trim() || `exam-${Date.now()}`;
      await saveExam(id, { title, sourceFileName, workbook, createdBy });
      markSaved(id);
      return `'${title}' 자료를 저장했습니다.`;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving };
}
