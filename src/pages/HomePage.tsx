import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { deleteExam, listExams, saveExam, type ExamMeta } from '../firebase/repo';
import { diffWorkbook, parseWorkbook } from '../core';
import { titleFromFileName, useExamStore } from '../store/examStore';

/** 첫 화면 — 저장된 시험 자료 목록 + 새 엑셀 올리기. 시험 자료 하나가 작업 단위다. */
export function HomePage({ user }: { user: AppUser }) {
  const navigate = useNavigate();
  const { openExam, examId: openId, dirty, close } = useExamStore();
  const [exams, setExams] = useState<ExamMeta[] | null>(firebaseConfigured ? null : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!firebaseConfigured) return;
    listExams()
      .then(setExams)
      .catch((e) => {
        setExams([]);
        setError(`시험 자료 목록을 불러오지 못했습니다: ${e.message}`);
      });
  }, []);
  useEffect(refresh, [refresh]);

  const leaveCurrent = () => {
    if (dirty && openId && !window.confirm('열려 있는 시험 자료에 저장하지 않은 변경이 있습니다. 버리고 계속할까요?')) return false;
    close();
    return true;
  };

  /** 새 엑셀 → 바로 시험 자료 문서를 만들고(기록 포함) 데이터 수정 화면으로 */
  const onFile = async (file: File | undefined) => {
    if (!file || !leaveCurrent()) return;
    setBusy(true);
    setError(null);
    try {
      const workbook = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
      const title = titleFromFileName(file.name);
      const data = { title, sourceFileName: file.name, workbook, vacancies: [] };
      let id = 'local';
      if (firebaseConfigured) {
        const diff = diffWorkbook(null, workbook);
        id = await saveExam(null, data, user.email, (newId) => ({
          action: 'exam_create',
          examId: newId,
          examTitle: title,
          summary: `${file.name} — ${diff.summary}`,
          details: diff.lines,
        }));
      }
      openExam(id, data);
      navigate(`/exams/${id}/edit`);
    } catch (e) {
      setError(`파일을 읽지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const open = (ex: ExamMeta) => {
    if (openId !== ex.id && !leaveCurrent()) return;
    navigate(`/exams/${ex.id}/work`);
  };

  const remove = async (ex: ExamMeta) => {
    if (!window.confirm(`'${ex.title}' 자료를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteExam(ex.id, { action: 'exam_delete', examId: ex.id, examTitle: ex.title, summary: `'${ex.title}' 삭제 (${ex.sourceFileName})` });
      if (openId === ex.id) close();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const fmt = (d?: Date) => (d ? d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '');

  return (
    <Stack spacing={3}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {firebaseConfigured && (
        <Paper variant="outlined">
          <Typography variant="subtitle1" sx={{ fontWeight: 700, px: 2, pt: 2 }}>
            시험 자료
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
            시험 자료를 열면 데이터 수정 · 응시현황표 · 결번 관리를 할 수 있습니다.
          </Typography>
          {exams === null ? (
            <Box sx={{ p: 3, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : exams.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              아직 시험 자료가 없습니다. 아래에서 응시현황 엑셀을 올리세요.
            </Typography>
          ) : (
            <List>
              {exams.map((ex) => (
                <ListItem
                  key={ex.id}
                  disablePadding
                  secondaryAction={
                    user.role === 'admin' && (
                      <Tooltip title="삭제 (관리자)">
                        <IconButton edge="end" aria-label="삭제" onClick={() => remove(ex)}>
                          <DeleteOutlineIcon />
                        </IconButton>
                      </Tooltip>
                    )
                  }
                >
                  <ListItemButton onClick={() => open(ex)} disabled={busy}>
                    <DescriptionOutlinedIcon sx={{ mr: 2, color: 'primary.main' }} />
                    <ListItemText
                      primary={<Typography sx={{ fontWeight: 600 }}>{ex.title}</Typography>}
                      secondary={`${ex.sourceFileName} · 마지막 저장 ${fmt(ex.updatedAt)}${ex.updatedBy ? ` (${ex.updatedBy})` : ''}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      )}

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
          p: 4,
          textAlign: 'center',
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragging ? 'primary.main' : 'divider',
          bgcolor: dragging ? '#e8f5e9' : '#fff',
        }}
      >
        <UploadFileIcon sx={{ fontSize: 40, color: 'primary.main' }} />
        <Typography variant="subtitle1" sx={{ mt: 1, fontWeight: 700 }}>
          새 시험 자료 만들기 — 응시현황 엑셀 올리기
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          'N학년 응시현황' 시트와 '과목별 시험 계획' 시트가 들어 있는 .xlsx 파일을 끌어다 놓거나 선택하세요.
        </Typography>
        <Button variant="contained" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? '올리는 중…' : '파일 선택'}
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
        {!firebaseConfigured && (
          <Alert severity="info" sx={{ mt: 2, textAlign: 'left' }}>
            Firebase가 설정되지 않아 <b>로컬 모드</b>로 동작합니다. 저장·활동 기록·Google 시트 내보내기는 사용할 수 없습니다.
          </Alert>
        )}
      </Paper>
    </Stack>
  );
}
