import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Link,
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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ACTIONS, listActivity, type ActionType, type ActivityFilter, type ActivityLog } from '../firebase/activity';
import { listExams, type ExamMeta } from '../firebase/repo';
import { ACTION_COLOR } from '../components/activityStyle';

const fmt = (d?: Date) =>
  d ? d.toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '';

/** 활동 기록 — 누가 언제 무엇을 했는지 (고칠 수도 지울 수도 없는 기록) */
export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const filter: ActivityFilter = {
    examId: params.get('exam') ?? undefined,
    email: params.get('user') ?? undefined,
    action: (params.get('action') as ActionType | null) ?? undefined,
  };
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [exams, setExams] = useState<ExamMeta[]>([]);
  const key = params.toString();

  const load = useCallback(
    async (more = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listActivity(filter, more ? cursor : undefined);
        setLogs((prev) => (more ? [...prev, ...res.logs] : res.logs));
        setCursor(res.next);
      } catch (e) {
        setError(`활동 기록을 불러오지 못했습니다: ${(e as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, cursor],
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    listExams().then(setExams).catch(() => setExams([]));
  }, []);

  // 서버에서는 필터 하나만 걸고, 나머지 조건은 화면에서 거른다(복합 색인 최소화)
  const shown = useMemo(
    () =>
      logs.filter(
        (l) =>
          (!filter.examId || l.examId === filter.examId) &&
          (!filter.email || l.email === filter.email) &&
          (!filter.action || l.action === filter.action),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, key],
  );

  const users = useMemo(() => {
    const m = new Map<string, string>();
    logs.forEach((l) => m.set(l.email, l.name || l.email));
    if (filter.email && !m.has(filter.email)) m.set(filter.email, filter.email);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, key]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const download = () => {
    const rows = shown.map((l) => ({
      시각: fmt(l.at),
      이름: l.name,
      이메일: l.email,
      활동: ACTIONS[l.action] ?? l.action,
      시험자료: l.examTitle ?? '',
      내용: l.summary,
      상세: (l.details ?? []).join('\n'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 26 }, { wch: 16 }, { wch: 24 }, { wch: 50 }, { wch: 80 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '활동 기록');
    XLSX.writeFile(wb, `활동기록_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          활동 기록
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          로그인, 엑셀 업로드, 데이터 저장(바뀐 내용), 인쇄·내보내기, 사용자·권한 변경 등 이 페이지에서 한 모든 활동이 남습니다. 기록은 누구도 고치거나
          지울 수 없습니다.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
          <TextField select size="small" label="시험 자료" value={filter.examId ?? ''} onChange={(e) => setParam('exam', e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">전체</MenuItem>
            {exams.map((x) => (
              <MenuItem key={x.id} value={x.id}>
                {x.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="사용자" value={filter.email ?? ''} onChange={(e) => setParam('user', e.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">전체</MenuItem>
            {users.map(([email, name]) => (
              <MenuItem key={email} value={email}>
                {name} {name !== email && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>{email}</Typography>}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="활동" value={filter.action ?? ''} onChange={(e) => setParam('action', e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">전체</MenuItem>
            {(Object.keys(ACTIONS) as ActionType[]).map((a) => (
              <MenuItem key={a} value={a}>
                {ACTIONS[a]}
              </MenuItem>
            ))}
          </TextField>
          {key && <Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>필터 해제</Button>}
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<RefreshIcon />} onClick={() => load(false)} disabled={loading}>
            새로고침
          </Button>
          <Button startIcon={<DownloadIcon />} onClick={download} disabled={!shown.length}>
            엑셀로 내려받기
          </Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#f1f5f2', fontWeight: 600 } }}>
              <TableCell sx={{ width: 40 }} />
              <TableCell sx={{ width: 160 }}>시각</TableCell>
              <TableCell sx={{ width: 150 }}>사용자</TableCell>
              <TableCell sx={{ width: 150 }}>활동</TableCell>
              <TableCell sx={{ width: 200 }}>시험 자료</TableCell>
              <TableCell>내용</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((l) => {
              const hasDetails = (l.details?.length ?? 0) > 0;
              const isOpen = open.has(l.id);
              return (
                <Fragment key={l.id}>
                  <TableRow hover onClick={() => hasDetails && toggle(l.id)} sx={{ cursor: hasDetails ? 'pointer' : 'default', '& > td': { borderBottom: isOpen ? 'none' : undefined } }}>
                    <TableCell padding="none" align="center">
                      {hasDetails && <IconButton size="small">{isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}</IconButton>}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.at)}</TableCell>
                    <TableCell>
                      <Link component="button" underline="hover" onClick={(e) => { e.stopPropagation(); setParam('user', l.email); }} title={l.email} sx={{ fontWeight: 600 }}>
                        {l.name || l.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={ACTION_COLOR[l.action] ?? 'default'} variant={ACTION_COLOR[l.action] ? 'filled' : 'outlined'} label={ACTIONS[l.action] ?? l.action} />
                    </TableCell>
                    <TableCell>
                      {l.examId ? (
                        <Link component={RouterLink} to={`/exams/${l.examId}/work`} onClick={(e) => e.stopPropagation()} underline="hover">
                          {l.examTitle || l.examId}
                        </Link>
                      ) : (
                        ''
                      )}
                    </TableCell>
                    <TableCell sx={{ wordBreak: 'break-all' }}>
                      {l.summary}
                      {hasDetails && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (상세 {l.details!.length}줄)
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  {hasDetails && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, bgcolor: '#fafbfa' }}>
                        <Collapse in={isOpen} unmountOnExit>
                          <Box component="ul" sx={{ m: 0, py: 1.5, pl: 7, fontSize: 13, lineHeight: 1.7, maxHeight: 360, overflowY: 'auto' }}>
                            {l.details!.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {loading && (
          <Box sx={{ p: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {!loading && shown.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            기록이 없습니다.
          </Typography>
        )}
        {!loading && cursor && (
          <Box sx={{ p: 1.5, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
            <Button onClick={() => load(true)}>더 보기</Button>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
