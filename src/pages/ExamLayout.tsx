import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { Alert, Box, Button, Chip, CircularProgress, InputBase, Paper, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { loadExam, watchExam } from '../firebase/repo';
import { logActivity } from '../firebase/activity';
import { mergeWorkbook } from '../core';
import { useExamStore } from '../store/examStore';
import { SaveButton } from '../components/SaveButton';

const TABS = [
  { path: 'edit', label: '데이터 수정' },
  { path: 'work', label: '응시현황표' },
  { path: 'vacancies', label: '결번 관리' },
];

/** 다른 사람이 먼저 저장한 최신본 정보 (내 화면이 뒤처졌을 때) */
interface RemoteSave {
  byName: string;
  versionCount: number;
}

/** 시험 자료 하나 = 작업 공간. 위에 시험 이름·저장, 아래 탭 3개(데이터 수정·응시현황표·결번 관리) */
export function ExamLayout({ user }: { user: AppUser }) {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { examId: openId, title, sourceFileName, dirty, version, openExam, setTitle, close, rebase } = useExamStore();
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteSave | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // 주소의 시험이 열려 있지 않으면 서버에서 불러온다 (새로고침·링크 공유 대응)
  useEffect(() => {
    if (openId === examId) return;
    if (!firebaseConfigured || examId === 'local') {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    setError(null);
    setRemote(null);
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

  // 다른 사람이 저장하면 실시간으로 알아챈다
  //  - 내가 고친 게 없으면 최신본을 바로 불러온다
  //  - 고친 게 있으면 경고를 띄운다(저장할 때 자동으로 합쳐지고, 지금 합칠 수도 있음)
  useEffect(() => {
    if (!firebaseConfigured || openId !== examId) return;
    return watchExam(examId, (s) => {
      const st = useExamStore.getState();
      if (st.saving || st.examId !== examId) return; // 내 저장이 되돌아온 것
      if (s.revision <= st.version.revision) {
        setRemote(null);
        return;
      }
      if (!st.dirty) {
        loadExam(examId)
          .then((d) => {
            if (useExamStore.getState().dirty) {
              setRemote({ byName: s.updatedByName, versionCount: d.versionCount });
              return;
            }
            openExam(examId, d);
            setRemote(null);
            setToast(`${s.updatedByName || '다른 선생님'}님이 저장한 최신본(v${d.versionCount})을 불러왔습니다.`);
          })
          .catch(() => setRemote({ byName: s.updatedByName, versionCount: s.versionCount }));
      } else {
        setRemote({ byName: s.updatedByName, versionCount: s.versionCount });
      }
    });
  }, [examId, openId, openExam]);

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

  /** 최신본 위에 내 변경을 지금 합친다 (저장은 아직 안 함) */
  const mergeNow = async () => {
    setSyncing(true);
    try {
      const st = useExamStore.getState();
      const latest = await loadExam(examId);
      const base = st.saved ?? { workbook: latest.workbook, title: latest.title, vacancies: latest.vacancies };
      const merged = mergeWorkbook(base, { workbook: st.workbook!, title: st.title, vacancies: st.vacancies }, latest);
      rebase(latest, merged);
      setRemote(null);
      setToast(
        merged.conflicts.length
          ? `최신본(v${latest.versionCount})에 내 변경 ${merged.applied}건을 합쳤습니다. 같은 칸 ${merged.conflicts.length}곳은 최신본 값을 남겼습니다: ${merged.conflicts.slice(0, 3).join(' / ')}${merged.conflicts.length > 3 ? ' …' : ''}`
          : `최신본(v${latest.versionCount})에 내 변경 ${merged.applied}건을 합쳤습니다. 저장하면 반영됩니다.`,
      );
    } catch (e) {
      setToast(`합치기 실패: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const discardAndReload = async () => {
    if (!window.confirm('저장하지 않은 내 변경을 버리고 최신본을 불러올까요?')) return;
    setSyncing(true);
    try {
      openExam(examId, await loadExam(examId));
      setRemote(null);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Stack spacing={2}>
      {/* 스크롤해도 시험 이름·저장·탭이 보이도록 메뉴바 아래에 고정 */}
      <Paper variant="outlined" sx={{ position: 'sticky', top: 48, zIndex: 5, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, pt: 1 }}>
          <Button size="small" color="inherit" startIcon={<ArrowBackIcon />} onClick={back} sx={{ flexShrink: 0, color: 'text.secondary' }}>
            목록
          </Button>
          <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', flexShrink: 0 }} />
          {/* 시험 이름: 평소엔 제목처럼 보이고, 클릭하면 바로 고칠 수 있다 */}
          <InputBase
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            inputProps={{ 'aria-label': '시험 이름', title: '클릭해서 시험 이름 고치기' }}
            sx={{
              flex: '0 1 auto',
              minWidth: 120,
              width: `${Math.max(8, [...title].length * 1.15 + 1.5)}em`,
              maxWidth: 420,
              fontSize: '1.15rem',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              px: 1,
              borderRadius: 1.5,
              border: '1px solid transparent',
              '&:hover': { bgcolor: 'action.hover' },
              '&.Mui-focused': { bgcolor: '#fff', borderColor: 'primary.main' },
            }}
          />
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0, display: { xs: 'none', sm: 'flex' } }}>
            {version.versionCount > 0 && (
              <Chip size="small" label={`v${version.versionCount}`} title="지금 보고 있는 버전" sx={{ height: 20, fontSize: 11, fontWeight: 700 }} />
            )}
            <Typography variant="caption" color="text.secondary" noWrap title={sourceFileName}>
              {sourceFileName}
            </Typography>
          </Stack>
          <Box sx={{ flex: 1 }} />
          {dirty && <Chip size="small" color="warning" label="저장 안 된 변경" sx={{ flexShrink: 0 }} />}
          {firebaseConfigured && <SaveButton userEmail={user.email} />}
        </Stack>
        {remote && (
          <Alert
            severity="warning"
            sx={{ mx: 2, mt: 1.5 }}
            action={
              <Stack direction="row" spacing={1}>
                <Button color="inherit" size="small" variant="outlined" disabled={syncing} onClick={mergeNow}>
                  지금 합치기
                </Button>
                <Button color="inherit" size="small" disabled={syncing} onClick={discardAndReload}>
                  내 변경 버리고 최신본 불러오기
                </Button>
              </Stack>
            }
          >
            <b>{remote.byName || '다른 선생님'}</b>님이 그사이 저장했습니다(v{remote.versionCount}). 지금 저장하면 최신본에 내 변경을 자동으로 합쳐
            저장합니다(같은 칸을 서로 다르게 고친 곳만 확인 요청).
          </Alert>
        )}
        <Tabs value={tab} sx={{ px: 1, minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0, px: 1.5, fontWeight: 700, fontSize: 14 } }}>
          {TABS.map((t) => (
            <Tab key={t.path} value={t.path} label={t.label} component={NavLink} to={`/exams/${examId}/${t.path}`} />
          ))}
        </Tabs>
      </Paper>
      <Outlet />
      <Snackbar open={toast !== null} autoHideDuration={8000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity="info" variant="filled" onClose={() => setToast(null)}>
            {toast}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Stack>
  );
}
