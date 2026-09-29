import { useEffect, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import { useExamStore } from '../store/examStore';
import { useSaveExam } from '../store/useSaveExam';

/** 상단 메뉴바의 저장 버튼 — 어느 화면에서든 저장, Ctrl+S 단축키 */
export function SaveButton({ userEmail }: { userEmail: string }) {
  const hasData = useExamStore((s) => s.workbook !== null);
  const dirty = useExamStore((s) => s.dirty);
  const { save, saving } = useSaveExam(userEmail);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const run = async () => {
    if (saving) return;
    // 편집 중인 칸이 있으면 먼저 확정 (입력창 blur → 반영)
    const active = document.activeElement as HTMLElement | null;
    if (active && active.tagName === 'INPUT') {
      active.blur();
      await new Promise((r) => setTimeout(r, 0));
    }
    try {
      setMsg({ kind: 'success', text: await save() });
    } catch (e) {
      setMsg({ kind: 'error', text: `저장 실패: ${(e as Error).message}` });
    }
  };

  // 최신 run을 쓰도록 매 렌더마다 다시 건다 (가벼운 리스너)
  useEffect(() => {
    if (!hasData) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // 브라우저 '페이지 저장' 대신
        run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!hasData) return null;

  return (
    <>
      <Button
        size="small"
        variant={dirty ? 'contained' : 'outlined'}
        color={dirty ? 'primary' : 'inherit'}
        startIcon={dirty ? <SaveIcon /> : <CheckIcon />}
        disabled={saving}
        onClick={run}
        title="Ctrl+S"
        sx={{ mr: 1, minWidth: 96, ...(dirty ? {} : { color: 'text.secondary', borderColor: 'divider' }) }}
      >
        {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
      </Button>
      <Snackbar
        open={msg !== null}
        autoHideDuration={msg?.kind === 'error' ? 8000 : 2500}
        onClose={() => setMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {msg ? (
          <Alert severity={msg.kind} variant="filled" onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
