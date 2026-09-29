import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { loadExam } from '../firebase/repo';
import { logActivity } from '../firebase/activity';
import { useExamStore } from '../store/examStore';
import { SaveButton } from '../components/SaveButton';

const TABS = [
  { path: 'edit', label: '데이터 수정' },
  { path: 'work', label: '응시현황표' },
  { path: 'vacancies', label: '결번 관리' },
];

/** 시험 자료 하나 = 작업 공간. 위에 시험 이름·저장, 아래 탭 3개(데이터 수정·응시현황표·결번 관리) */
export function ExamLayout({ user }: { user: AppUser }) {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { examId: openId, title, sourceFileName, dirty, version, openExam, setTitle, close } = useExamStore();
  const [error, setError] = useState<string | null>(null);

  // 주소의 시험이 열려 있지 않으면 서버에서 불러온다 (새로고침·링크 공유 대응)
  useEffect(() => {
    if (openId === examId) return;
    if (!firebaseConfigured || examId === 'local') {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    setError(null);
    loadExam(examId)
      .then((data) => {
        if (cancelled) return;
        openExam(examId, data);
        logActivity({ action: 'exam_open', examId, examTitle: data.title, summary: `'${data.title}' 열기` });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [examId, openId, openExam, navigate]);

  if (error) {
    return (
      <Alert severity="error" action={<Button onClick={() => navigate('/')}>목록으로</Button>}>
        {error}
      </Alert>
    );
  }
  if (openId !== examId) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const tab = TABS.find((t) => location.pathname.endsWith(`/${t.path}`))?.path ?? 'edit';

  const back = () => {
    if (dirty && !window.confirm('저장하지 않은 변경 내용이 있습니다. 저장하지 않고 목록으로 갈까요?')) return;
    close();
    navigate('/');
  };

  return (
    <Stack spacing={2}>
      {/* 스크롤해도 시험 이름·저장·탭이 보이도록 메뉴바 아래에 고정 */}
      <Paper variant="outlined" sx={{ position: 'sticky', top: 48, zIndex: 5, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, px: 2, pt: 1.5 }}>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={back} sx={{ flexShrink: 0 }}>
            목록
          </Button>
          <TextField
            label="시험 이름"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ minWidth: { md: 320 } }}
          />
          <Typography variant="body2" color="text.secondary" noWrap>
            {sourceFileName}
          </Typography>
          {version.versionCount > 0 && <Chip size="small" variant="outlined" label={`v${version.versionCount}`} title="현재 버전" />}
          {dirty && <Chip size="small" color="warning" label="저장 안 된 변경 있음" />}
          <Box sx={{ flex: 1 }} />
          {firebaseConfigured && <SaveButton userEmail={user.email} />}
        </Stack>
        <Tabs value={tab} sx={{ px: 1, minHeight: 40, '& .MuiTab-root': { minHeight: 40, fontWeight: 600 } }}>
          {TABS.map((t) => (
            <Tab key={t.path} value={t.path} label={t.label} component={NavLink} to={`/exams/${examId}/${t.path}`} />
          ))}
        </Tabs>
      </Paper>
      <Outlet />
    </Stack>
  );
}
