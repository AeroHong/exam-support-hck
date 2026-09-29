import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert, Box, Button, Chip, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { useExamStore } from '../store/examStore';
import { useSaveExam } from '../store/useSaveExam';
import { exportWorkbook } from '../core';
import { IssuesPanel } from '../components/IssuesPanel';
import { GradeEditor } from '../components/GradeEditor';
import { PlanEditor } from '../components/PlanEditor';

/** 올린 응시현황 엑셀(시험 계획·학년별 명렬)을 웹에서 고치는 화면 */
export function EditPage({ user }: { user: AppUser }) {
  const navigate = useNavigate();
  const { workbook, issues, title, sourceFileName, dirty, history, edit, undo, setTitle, examId } = useExamStore();
  const { save, saving } = useSaveExam(user.email);
  const [tab, setTab] = useState('plan');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // 관리자·담당교사 모두 수정 가능 (지정되지 않은 계정은 로그인 단계에서 막힌다)
  const canEdit = !firebaseConfigured || user.role === 'admin' || user.role === 'manager';

  // Ctrl+Z 되돌리기 (입력칸에서 글자 되돌리기는 브라우저 기본 동작 유지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const t = e.target as HTMLElement;
        // 표의 칸 입력창은 이동 모드(빈 값)일 때만 데이터 되돌리기로 쓴다
        const gridIdle = t.getAttribute('aria-label') === '칸 편집' && (t as HTMLInputElement).value === '';
        if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !gridIdle) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  if (!workbook) return <Navigate to="/" replace />;

  const download = () => {
    const blob = new Blob([exportWorkbook(workbook)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || '응시현황'} 응시현황(수정).xlsx`.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const onSave = async () => {
    try {
      setMsg({ kind: 'success', text: await save() });
    } catch (e) {
      setMsg({ kind: 'error', text: `저장 실패: ${(e as Error).message}` });
    }
  };

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const sheet = workbook.grades.find((g) => g.grade === tab);

  return (
    <Stack spacing={2}>
      {/* 스크롤해도 저장·되돌리기가 보이도록 메뉴바 아래에 고정 */}
      <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: 56, zIndex: 5, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
          <TextField label="시험 이름" size="small" value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} sx={{ minWidth: 300 }} />
          <Typography variant="body2" color="text.secondary">
            {sourceFileName}
          </Typography>
          {dirty ? <Chip size="small" color="warning" label="저장 안 된 변경 있음" /> : examId && <Chip size="small" color="success" variant="outlined" label="저장됨" />}
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<UndoIcon />} disabled={!history.length} onClick={undo}>
            되돌리기{history.length ? ` (${history.length})` : ''}
          </Button>
          <Button startIcon={<DownloadIcon />} onClick={download}>
            엑셀로 내려받기
          </Button>
          {firebaseConfigured && canEdit && (
            <Button variant={dirty ? 'contained' : 'outlined'} startIcon={<SaveIcon />} disabled={saving} onClick={onSave} title="Ctrl+S" sx={{ minWidth: 100 }}>
              {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
            </Button>
          )}
          <Button endIcon={<ArrowForwardIcon />} onClick={() => navigate('/work')}>
            응시현황표
          </Button>
        </Stack>
        {!canEdit && (
          <Alert severity="info" sx={{ mt: 2 }}>
            보기 전용입니다. 수정은 관리자만 할 수 있습니다.
          </Alert>
        )}
        {msg && (
          <Alert severity={msg.kind} sx={{ mt: 2 }} onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        )}
      </Paper>

      <IssuesPanel issues={issues} />

      <Paper variant="outlined" sx={{ px: 2, pt: 1, pb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="plan" label={`시험 계획 (${workbook.plan.length})`} />
          {workbook.grades.map((g) => (
            <Tab key={g.grade} value={g.grade} label={`${g.grade} (${g.students.length}명)`} />
          ))}
        </Tabs>
        {tab === 'plan' ? (
          <PlanEditor workbook={workbook} canEdit={canEdit} onEdit={edit} />
        ) : (
          sheet && <GradeEditor key={sheet.grade} sheet={sheet} canEdit={canEdit} onEdit={edit} />
        )}
        {errorCount > 0 && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
            오류 {errorCount}건이 있는 시험은 현황표를 만들지 않습니다. 위 '데이터 검증'을 확인하세요.
          </Typography>
        )}
      </Paper>
    </Stack>
  );
}
