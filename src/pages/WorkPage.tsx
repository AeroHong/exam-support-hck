import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import GridOnIcon from '@mui/icons-material/GridOn';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SaveIcon from '@mui/icons-material/Save';
import type { RoomSheet } from '../core';
import { filterRosters, type FilterMode } from '../core';
import { useExamStore } from '../store/examStore';
import type { AppUser } from '../firebase/auth';
import { getGoogleAccessToken } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { useSaveExam } from '../store/useSaveExam';
import { IssuesPanel } from '../components/IssuesPanel';
import { SheetPreview } from '../components/SheetPreview';
import { PrintRoot } from '../export/print/PrintRoot';
import type { GSheetsResult, GSheetsTarget } from '../export/gsheets';
import { GSheetsDialog } from '../components/GSheetsDialog';

const MODES: { value: FilterMode; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'DATE', label: '날짜별' },
  { value: 'GRADE', label: '학년별' },
  { value: 'SUBJECT', label: '과목별' },
  { value: 'ROOM', label: '고사실별' },
];

const KIND_COLOR = { normal: 'default', doum: 'warning', separate: 'secondary', waiting: 'info' } as const;

export function WorkPage({ user }: { user: AppUser }) {
  const { workbook, rosters, issues, title, sourceFileName, examId, dirty, setTitle } = useExamStore();
  const { save } = useSaveExam(user.email);
  const [mode, setMode] = useState<FilterMode>('ALL');
  const [value, setValue] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<RoomSheet | null>(null);
  const [printing, setPrinting] = useState<RoomSheet[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [gsResult, setGsResult] = useState<GSheetsResult | null>(null);
  const [gsOpen, setGsOpen] = useState(false);

  const options = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs)];
    switch (mode) {
      case 'DATE':
        return uniq(rosters.map((r) => r.dateStr)).sort();
      case 'GRADE':
        return uniq(rosters.map((r) => r.grade)).sort();
      case 'SUBJECT':
        return rosters.map((r) => r.subjectKey);
      case 'ROOM':
        return uniq(rosters.flatMap((r) => r.sheets.map((s) => s.roomName))).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
      default:
        return [];
    }
  }, [mode, rosters]);

  const filtered = useMemo(
    () => (mode === 'ALL' || value ? filterRosters(rosters, { mode, value }) : []),
    [rosters, mode, value],
  );
  const selected = filtered.filter((r) => !excluded.has(r.subjectKey));
  const selectedSheets = selected.flatMap((r) => r.sheets);
  const skipped = rosters.filter((r) => r.skipped);

  useEffect(() => {
    if (!preview || !selectedSheets.some((s) => s.key === preview.key)) setPreview(selectedSheets[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  // 인쇄 영역이 그려진 다음 인쇄 대화상자를 연다
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  if (!workbook) return <Navigate to="/" replace />;

  const labelOf = (key: string) => {
    const r = rosters.find((x) => x.subjectKey === key);
    return r ? `${r.dateStr} ${r.period}교시 · ${r.grade} ${r.subject}` : key;
  };

  const toggle = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setStatus({ kind: 'info', text: `${label} 중…` });
    try {
      const msg = await fn();
      setStatus({ kind: 'success', text: msg || `${label} 완료` });
    } catch (e) {
      setStatus({ kind: 'error', text: `${label} 실패: ${(e as Error).message}` });
    } finally {
      setProgress(null);
    }
  };

  const onXlsx = () =>
    run('XLSX 만들기', async () => {
      // ExcelJS가 커서 누를 때만 불러온다
      const { exportRostersToFile, downloadBlob } = await import('../export/xlsx');
      const { blob, fileName } = await exportRostersToFile(selected);
      downloadBlob(blob, fileName);
      return `${fileName} 다운로드 (${selected.length}과목, ${selectedSheets.length}장)`;
    });

  const onGSheets = (target: GSheetsTarget) => {
    setGsOpen(false);
    return run('Google 스프레드시트 만들기', async () => {
      setGsResult(null);
      const token = await getGoogleAccessToken();
      const { exportToGoogleSheets } = await import('../export/gsheets');
      setProgress(0);
      const res = await exportToGoogleSheets(token, selected, target, (d, t) => setProgress((d / t) * 100));
      setGsResult(res);
      return `Google Drive에 ${res.files.length}개 파일을 만들었습니다.`;
    });
  };

  const onSave = () => run('저장', save);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
          <TextField
            label="시험 이름"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ minWidth: 320 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {sourceFileName} · {workbook.grades.map((g) => `${g.grade} ${g.students.length}명`).join(', ')} · 시험 {rosters.length}건
          </Typography>
          {firebaseConfigured && user.role === 'admin' && (
            <Button variant={dirty ? 'contained' : 'outlined'} startIcon={<SaveIcon />} onClick={onSave}>
              {examId ? (dirty ? '변경 내용 저장' : '저장됨') : '저장'}
            </Button>
          )}
        </Stack>
      </Paper>

      <IssuesPanel issues={issues} />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, m: FilterMode | null) => {
              if (!m) return;
              setMode(m);
              setValue('');
              setExcluded(new Set());
            }}
          >
            {MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ px: 2 }}>
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {mode !== 'ALL' && (
            <TextField
              select
              size="small"
              label="선택"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setExcluded(new Set());
              }}
              sx={{ minWidth: 280 }}
            >
              {options.map((o) => (
                <MenuItem key={o} value={o}>
                  {mode === 'SUBJECT' ? labelOf(o) : o}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            선택 {selected.length}과목 · {selectedSheets.length}장
          </Typography>
          <Button variant="contained" startIcon={<PrintIcon />} disabled={!selectedSheets.length} onClick={() => setPrinting(selectedSheets)}>
            인쇄 / PDF
          </Button>
          <Button variant="outlined" startIcon={<GridOnIcon />} disabled={!selected.length} onClick={onXlsx}>
            XLSX
          </Button>
          {firebaseConfigured && (
            <Button variant="outlined" startIcon={<CloudUploadIcon />} disabled={!selected.length} onClick={() => setGsOpen(true)}>
              Google 시트
            </Button>
          )}
        </Stack>
        {progress !== null && <LinearProgress variant="determinate" value={progress} sx={{ mt: 2 }} />}
        {status && (
          <Alert severity={status.kind} sx={{ mt: 2 }} onClose={() => setStatus(null)}>
            {status.text}
            {gsResult && status.kind === 'success' && (
              <>
                {' '}
                <a href={gsResult.folderUrl} target="_blank" rel="noreferrer">
                  Drive 폴더 열기
                </a>
              </>
            )}
          </Alert>
        )}
        {skipped.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            소속 미확인(?) 학생 때문에 건너뛴 시험: {skipped.map((r) => `${r.grade} ${r.subject}`).join(', ')}
          </Alert>
        )}
      </Paper>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, width: '100%', overflowX: 'auto' }}>
          {filtered.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              {mode === 'ALL' ? '만들 현황표가 없습니다.' : '위에서 항목을 선택하세요.'}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={excluded.size === 0}
                      indeterminate={excluded.size > 0 && selected.length > 0}
                      onChange={() =>
                        setExcluded(excluded.size === 0 ? new Set(filtered.map((r) => r.subjectKey)) : new Set())
                      }
                    />
                  </TableCell>
                  <TableCell>날짜</TableCell>
                  <TableCell>교시</TableCell>
                  <TableCell>학년</TableCell>
                  <TableCell>과목(코드)</TableCell>
                  <TableCell>고사실 (클릭하면 미리보기)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.subjectKey} hover selected={!excluded.has(r.subjectKey)}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={!excluded.has(r.subjectKey)} onChange={() => toggle(r.subjectKey)} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.dateStr}</TableCell>
                    <TableCell>{r.period}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.grade}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {r.subject}
                      {r.code && <Typography component="span" variant="caption" color="text.secondary"> ({r.code})</Typography>}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {r.sheets.map((s) => (
                          <Chip
                            key={s.key}
                            size="small"
                            color={KIND_COLOR[s.kind]}
                            variant={preview?.key === s.key ? 'filled' : 'outlined'}
                            label={`${s.roomName} ${s.main.length}${s.doum.length + s.separate.length ? `+${s.doum.length + s.separate.length}` : ''}`}
                            onClick={() => setPreview(s)}
                          />
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <SheetPreview sheet={preview} />
      </Stack>

      {printing && <PrintRoot sheets={printing} />}
      {gsOpen && (
        <GSheetsDialog
          open
          defaultSubfolder={`${title || '응시현황표'} 응시현황표 ${new Date().toLocaleDateString('ko-KR')}`}
          count={{ subjects: selected.length, sheets: selectedSheets.length }}
          onClose={() => setGsOpen(false)}
          onConfirm={onGSheets}
        />
      )}
    </Stack>
  );
}
