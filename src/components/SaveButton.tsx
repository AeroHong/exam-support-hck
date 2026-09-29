import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckIcon from '@mui/icons-material/Check';
import { useExamStore } from '../store/examStore';
import { useSaveExam } from '../store/useSaveExam';

/** 저장 버튼 — Ctrl+S 단축키, 다른 사람과 동시에 고친 경우 합친 결과·충돌을 알린다 */
export function SaveButton({ userEmail }: { userEmail: string }) {
  const hasData = useExamStore((s) => s.workbook !== null);
  const dirty = useExamStore((s) => s.dirty);
  const { save, saving } = useSaveExam(userEmail);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<string[] | null>(null);

  const run = async () => {
    if (saving) return;
    // 편집 중인 칸이 있으면 먼저 확정 (입력창 blur → 반영)
    const active = document.activeElement as HTMLElement | null;
    if (active && active.tagName === 'INPUT') {
      active.blur();
      await new Promise((r) => setTimeout(r, 0));
    }
    try {
      const out = await save();
      if (out.conflicts?.length) setConflicts(out.conflicts);
      setMsg({ kind: out.conflicts?.length ? 'warning' : 'success', text: out.message });
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
        open={msg !== null && conflicts === null}
        autoHideDuration={msg?.kind === 'success' ? 3500 : 10000}
        onClose={() => setMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {msg ? (
          <Alert severity={msg.kind} variant="filled" onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        ) : undefined}
      </Snackbar>

      <Dialog open={conflicts !== null} onClose={() => setConflicts(null)} maxWidth="md" fullWidth>
        <DialogTitle>다른 선생님과 같은 칸을 고쳤습니다</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {msg?.text}
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            아래 칸은 최신 저장본의 값으로 두었습니다. 내 값이 맞으면 해당 칸을 다시 고친 뒤 저장하세요. 나머지 내 변경은 이미 합쳐져 있습니다(아직 저장 전).
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13.5, lineHeight: 1.8, maxHeight: 360, overflowY: 'auto' }}>
            {conflicts?.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              setConflicts(null);
              setMsg(null);
            }}
          >
            확인
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
