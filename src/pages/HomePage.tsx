import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { deleteExam, listExams, loadExam, loadVacancies, type ExamMeta } from '../firebase/repo';
import { useExamStore } from '../store/examStore';
import { examYear } from './vacancyYear';

export function HomePage({ user }: { user: AppUser }) {
  const navigate = useNavigate();
  const { loadFile, setWorkbook, setVacancies } = useExamStore();
  const [exams, setExams] = useState<ExamMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!firebaseConfigured) return;
    listExams().then(setExams).catch((e) => setError(`저장된 시험 목록을 불러오지 못했습니다: ${e.message}`));
  }, []);
  useEffect(refresh, [refresh]);

  const syncVacancies = async () => {
    const wb = useExamStore.getState().workbook;
    if (!firebaseConfigured || !wb) return;
    try {
      setVacancies(await loadVacancies(examYear(wb)));
    } catch {
      /* 결번 목록이 없어도 현황표는 만들 수 있다 */
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await loadFile(file);
      await syncVacancies();
      navigate('/work');
    } catch (e) {
      setError(`파일을 읽지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const ex = await loadExam(id);
      setWorkbook(ex.workbook, { title: ex.title, sourceFileName: ex.sourceFileName, examId: id });
      await syncVacancies();
      navigate('/work');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ex: ExamMeta) => {
    if (!window.confirm(`'${ex.title}' 자료를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteExam(ex.id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}

      <Paper
        variant="outlined"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files[0]);
        }}
        sx={{
          p: 5,
          textAlign: 'center',
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging ? '#e8f5e9' : '#fff',
        }}
      >
        <UploadFileIcon sx={{ fontSize: 48, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
          응시현황 엑셀 파일 올리기
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          'N학년 응시현황' 시트와 '과목별 시험 계획' 시트가 들어 있는 .xlsx 파일을 끌어다 놓거나 선택하세요.
        </Typography>
        <Button variant="contained" disabled={busy} onClick={() => inputRef.current?.click()}>
          파일 선택
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          파일은 브라우저 안에서만 읽습니다. 서버에 저장하려면 다음 화면에서 '저장'을 누르세요.
        </Typography>
      </Paper>

      {firebaseConfigured ? (
        <Paper variant="outlined">
          <Typography variant="subtitle1" sx={{ fontWeight: 700, px: 2, pt: 2 }}>
            저장된 시험 자료
          </Typography>
          {exams.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              아직 저장된 자료가 없습니다.
            </Typography>
          ) : (
            <List>
              {exams.map((ex) => (
                <ListItem
                  key={ex.id}
                  disablePadding
                  secondaryAction={
                    user.role === 'admin' && (
                      <IconButton edge="end" aria-label="삭제" onClick={() => remove(ex)}>
                        <DeleteOutlineIcon />
                      </IconButton>
                    )
                  }
                >
                  <ListItemButton onClick={() => open(ex.id)} disabled={busy}>
                    <ListItemText
                      primary={ex.title}
                      secondary={`${ex.sourceFileName} · ${ex.updatedAt ? ex.updatedAt.toLocaleString('ko-KR') : ''}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      ) : (
        <Box>
          <Alert severity="info">
            Firebase가 설정되지 않아 <b>로컬 모드</b>로 동작합니다. 현황표 제작·인쇄·XLSX 내보내기는 그대로 쓸 수 있고, 로그인·저장·Google 시트
            내보내기는 <code>.env</code> 설정 후 사용할 수 있습니다.
          </Alert>
        </Box>
      )}
    </Stack>
  );
}
