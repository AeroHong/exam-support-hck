import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
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
import { filterRosters, type FilterMode } from '../core';
import { useExamStore } from '../store/examStore';
import type { AppUser } from '../firebase/auth';
import { getGoogleAccessToken } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { logActivity, type ActionType } from '../firebase/activity';
import { IssuesPanel } from '../components/IssuesPanel';
import { useOpenIssue } from '../components/useOpenIssue';
import { SheetPreview } from '../components/SheetPreview';
import { PrintRoot, printItemLabel, printItemsOf, type PrintItem } from '../export/print/PrintRoot';
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

export function WorkPage(_: { user: AppUser }) {
  const { workbook, rosters, issues, title, examId } = useExamStore();
  const openIssue = useOpenIssue(examId);
  const [mode, setMode] = useState<FilterMode>('ALL');
  const [value, setValue] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PrintItem | null>(null);
  const [printing, setPrinting] = useState<PrintItem[] | null>(null);
  // 과목별 '여분' 표지 — 고사실별로 뽑을 때는 기본으로 뺀다
  const [withSpare, setWithSpare] = useState(true);
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
  const items = useMemo(() => printItemsOf(selected, withSpare), [selected, withSpare]); // eslint-disable-line react-hooks/exhaustive-deps
  const skipped = rosters.filter((r) => r.skipped);

  useEffect(() => {
    if (!preview || !items.some((s) => s.key === preview.key)) setPreview(items[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, withSpare]);

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

  if (!workbook || !examId) return null;

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

  /** 무엇을 출력했는지 활동 기록에 남긴다 (범위 + 과목별 고사실 목록) */
  const record = (action: ActionType, extra = '') => {
    const scope = mode === 'ALL' ? '전체' : `${MODES.find((m) => m.value === mode)?.label} ${mode === 'SUBJECT' ? labelOf(value) : value}`;
    logActivity({
      action,
      examId,
      examTitle: title,
      summary: `${scope} · ${selected.length}과목 ${items.length}장${withSpare ? '(여분 표지 포함)' : ''}${extra}`,
      details: selected.map((r) => `${r.dateStr} ${r.period}교시 ${r.grade} ${r.subject} — ${r.sheets.map((s) => s.roomName).join(', ')}`),
    });
  };

  const onPrint = () => {
    setPrinting(items);
    record('print');
  };

  /** 미리보기 중인 한 장만 인쇄 */
  const onPrintOne = (item: PrintItem) => {
    setPrinting([item]);
    const r = item.kind === 'room' ? rosters.find((x) => x.sheets.some((s) => s.key === item.key)) : item.roster;
    logActivity({
      action: 'print',
      examId,
      examTitle: title,
      summary: `1장 인쇄 · ${printItemLabel(item)}`,
      details: r ? [`${r.dateStr} ${r.period}교시 ${r.grade} ${printItemLabel(item)}`] : [],
    });
  };

  /** 한시 기능: 선택한 과목의 '여분' 표지만 인쇄 */
  const onPrintSpareOnly = () => {
    setPrinting(printItemsOf(selected, true).filter((it) => it.kind === 'spare'));
    const scope = mode === 'ALL' ? '전체' : `${MODES.find((m) => m.value === mode)?.label} ${mode === 'SUBJECT' ? labelOf(value) : value}`;
    logActivity({
      action: 'print',
      examId,
      examTitle: title,
      summary: `${scope} · 여분 표지만 ${selected.length}장`,
      details: selected.map((r) => `${r.dateStr} ${r.period}교시 ${r.grade} ${r.subject} — 여분`),
    });
  };

  const onXlsx = () =>
    run('XLSX 만들기', async () => {
      // ExcelJS가 커서 누를 때만 불러온다
      const { exportRostersToFile, downloadBlob } = await import('../export/xlsx');
      const { blob, fileName } = await exportRostersToFile(selected, { withSpare });
      downloadBlob(blob, fileName);
      record('export_xlsx', ` · ${fileName}`);
      return `${fileName} 다운로드 (${selected.length}과목, ${items.length}장)`;
    });

  const onGSheets = (target: GSheetsTarget) => {
    setGsOpen(false);
    return run('Google 스프레드시트 만들기', async () => {
      setGsResult(null);
      const token = await getGoogleAccessToken();
      const { exportToGoogleSheets } = await import('../export/gsheets');
      setProgress(0);
      const res = await exportToGoogleSheets(token, selected, target, (d, t) => setProgress((d / t) * 100), { withSpare });
      setGsResult(res);
      record('export_gsheets', ` · ${res.folderUrl}`);
      return `Google Drive에 ${res.files.length}개 파일을 만들었습니다.`;
    });
  };

  return (
    <Stack spacing={2}>
      <IssuesPanel issues={issues} storeKey={examId} onOpen={openIssue} />

      <Paper variant="outlined" sx={{ p: 2 }}>
        {/* 윗줄: 범위 고르기 */}
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, m: FilterMode | null) => {
              if (!m) return;
              setMode(m);
              setWithSpare(m !== 'ROOM');
              setValue('');
              setExcluded(new Set());
            }}
            sx={{
              bgcolor: '#eef1ef',
              p: 0.5,
              borderRadius: 999,
              gap: 0.5,
              '& .MuiToggleButton-root': {
                border: 0,
                borderRadius: '999px !important',
                m: '0 !important',
                px: 1.75,
                py: 0.5,
                fontWeight: 600,
                color: 'text.secondary',
              },
              '& .MuiToggleButton-root.Mui-selected': {
                bgcolor: '#fff',
                color: 'primary.main',
                boxShadow: '0 1px 3px rgba(0,0,0,0.14)',
                '&:hover': { bgcolor: '#fff' },
              },
            }}
          >
            {MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value}>
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
        </Stack>
        {/* 아랫줄: 출력 */}
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}
        >
          <FormControlLabel
            control={<Checkbox size="small" checked={withSpare} onChange={(e) => setWithSpare(e.target.checked)} />}
            label={<Typography variant="body2">과목별 '여분' 표지</Typography>}
            title="과목마다 A4 절반(접어서 봉투에 넣는) 크기의 '과목명 · 여분' 표지를 현황표 뒤에 붙입니다"
            sx={{ mr: 0.5 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            선택 <b>{selected.length}</b>과목 · <b>{items.length}</b>장
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="contained" startIcon={<PrintIcon />} disabled={!items.length} onClick={onPrint}>
            인쇄 / PDF
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon />}
            disabled={!selected.length}
            onClick={onPrintSpareOnly}
            title="선택한 과목의 '여분' 표지만 인쇄합니다 (과목당 1장)"
            sx={{ borderStyle: 'dashed', '&:hover': { borderStyle: 'dashed' } }}
          >
            여분만 인쇄
          </Button>
          <Button size="small" variant="outlined" startIcon={<GridOnIcon />} disabled={!selected.length} onClick={onXlsx}>
            XLSX
          </Button>
          {firebaseConfigured && (
            <Button size="small" variant="outlined" startIcon={<CloudUploadIcon />} disabled={!selected.length} onClick={() => setGsOpen(true)}>
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
                            onClick={() => setPreview({ kind: 'room', key: s.key, sheet: s })}
                          />
                        ))}
                        {withSpare && (
                          <Chip
                            size="small"
                            label="여분"
                            variant={preview?.key === `${r.subjectKey}|여분` ? 'filled' : 'outlined'}
                            onClick={() => setPreview({ kind: 'spare', key: `${r.subjectKey}|여분`, roster: r })}
                            sx={{ borderStyle: 'dashed', fontWeight: 700 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <SheetPreview item={preview} onPrint={onPrintOne} />
      </Stack>

      {printing && <PrintRoot items={printing} />}
      {gsOpen && (
        <GSheetsDialog
          open
          defaultSubfolder={`${title || '응시현황표'} 응시현황표 ${new Date().toLocaleDateString('ko-KR')}`}
          count={{ subjects: selected.length, sheets: items.length }}
          onClose={() => setGsOpen(false)}
          onConfirm={onGSheets}
        />
      )}
    </Stack>
  );
}
