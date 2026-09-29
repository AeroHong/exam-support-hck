import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import type { VacancyItem } from '../core';
import { detectVacancies, mergeVacancies } from '../core';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { loadVacancies, saveVacancies } from '../firebase/repo';
import { useExamStore } from '../store/examStore';
import { examYear } from './vacancyYear';

const HAKBEON = /^\d{5}$/;

/** 결번·결번(직업반) 학번 목록. 학급 = 고사실인 현황표의 요약표에 들어간다. */
export function VacancyPage({ user }: { user: AppUser }) {
  const { workbook, vacancies, setVacancies } = useExamStore();
  const [year, setYear] = useState(examYear(workbook));
  const [items, setItems] = useState<VacancyItem[]>(vacancies);
  const [hakbeon, setHakbeon] = useState('');
  const [type, setType] = useState<VacancyItem['type']>('결번');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const canEdit = !firebaseConfigured || user.role === 'admin';

  useEffect(() => setItems(vacancies), [vacancies]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.hakbeon.localeCompare(b.hakbeon)), [items]);

  const add = () => {
    if (!HAKBEON.test(hakbeon)) {
      setMsg({ kind: 'error', text: '학번은 5자리 숫자로 입력하세요. (예: 10215)' });
      return;
    }
    setItems([...items.filter((v) => v.hakbeon !== hakbeon), { hakbeon, type, note: note.trim() || undefined }]);
    setHakbeon('');
    setNote('');
    setMsg(null);
  };

  const detect = () => {
    if (!workbook) return;
    const found = detectVacancies(workbook.grades);
    const merged = mergeVacancies(items, found);
    setItems(merged);
    setMsg({ kind: 'info', text: `번호가 비어 있는 ${found.length}명을 찾았고, 새로 ${merged.length - items.length}명을 추가했습니다. 확인 후 적용하세요.` });
  };

  const apply = async () => {
    // Firestore는 undefined 필드를 허용하지 않는다
    const clean = items.map((v) => (v.note ? v : { hakbeon: v.hakbeon, type: v.type }));
    setVacancies(clean);
    if (!firebaseConfigured) {
      setMsg({ kind: 'success', text: '현황표에 적용했습니다. (로컬 모드라 새로고침하면 사라집니다)' });
      return;
    }
    try {
      await saveVacancies(year, clean);
      setMsg({ kind: 'success', text: `${year}학년도 결번 목록을 저장하고 현황표에 적용했습니다.` });
    } catch (e) {
      setMsg({ kind: 'error', text: `저장 실패: ${(e as Error).message}` });
    }
  };

  const reload = async () => {
    try {
      const v = await loadVacancies(year);
      setItems(v);
      setMsg({ kind: 'info', text: `${year}학년도 결번 ${v.length}건을 불러왔습니다.` });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          결번 관리
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          전출 등으로 비어 있는 번호(결번)와 직업반 위탁 학생(결번(직업반))을 학번으로 등록합니다. 학급 전체가 한 고사실에서 보는 시험의
          현황표 요약표에 표시됩니다. 결시는 감독교사가 직접 적습니다.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          {firebaseConfigured && (
            <>
              <TextField size="small" label="학년도" value={year} onChange={(e) => setYear(e.target.value)} sx={{ width: 110 }} />
              <Button onClick={reload}>불러오기</Button>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" disabled={!workbook || !canEdit} onClick={detect}>
            빈 번호 자동 찾기
          </Button>
          <Button variant="contained" disabled={!canEdit} onClick={apply}>
            {firebaseConfigured ? '저장 및 적용' : '적용'}
          </Button>
        </Stack>
        {msg && (
          <Alert severity={msg.kind} sx={{ mt: 2 }} onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        )}
      </Paper>

      {canEdit && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              label="학번"
              placeholder="10215"
              value={hakbeon}
              onChange={(e) => setHakbeon(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <TextField select size="small" label="구분" value={type} onChange={(e) => setType(e.target.value as VacancyItem['type'])} sx={{ width: 140 }}>
              <MenuItem value="결번">결번</MenuItem>
              <MenuItem value="직업반">결번(직업반)</MenuItem>
            </TextField>
            <TextField size="small" label="메모" value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1 }} />
            <Button variant="outlined" onClick={add}>
              추가
            </Button>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined">
        {sorted.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            등록된 결번이 없습니다.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>학번</TableCell>
                <TableCell>구분</TableCell>
                <TableCell>메모</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((v) => (
                <TableRow key={v.hakbeon}>
                  <TableCell>{v.hakbeon}</TableCell>
                  <TableCell>{v.type === '직업반' ? '결번(직업반)' : '결번'}</TableCell>
                  <TableCell>{v.note}</TableCell>
                  <TableCell align="right">
                    {canEdit && (
                      <IconButton size="small" aria-label="삭제" onClick={() => setItems(items.filter((x) => x.hakbeon !== v.hakbeon))}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
