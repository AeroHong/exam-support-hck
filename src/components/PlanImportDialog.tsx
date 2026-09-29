import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { comparePlan, extractTables, parseTimetable, type ImportRow, type ImportStatus, type ParsedWorkbook, type TimetableResult } from '../core';

/** hwpx 파일 → 시간표 (본문 section*.xml의 표를 모두 읽는다) */
export async function readHwpxTimetable(file: File, year: number): Promise<TimetableResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (sections.length === 0) throw new Error('한글(hwpx) 파일이 아니거나 본문을 찾을 수 없습니다. .hwp라면 한글에서 .hwpx로 다시 저장해 주세요.');
  const parser = new DOMParser();
  const tables = (await Promise.all(sections.map((s) => zip.file(s)!.async('string')))).flatMap((xml) => extractTables(xml, parser));
  return parseTimetable(tables, year);
}

const STATUS: Record<ImportStatus, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  added: { label: '추가', color: 'success' },
  changed: { label: '변경', color: 'warning' },
  removed: { label: '삭제', color: 'error' },
  same: { label: '같음', color: 'default' },
};

const slot = (r: ImportRow) => {
  const p = r.entry ?? r.current!;
  return `${p.dateStr.slice(5).replace('-', '/')} ${p.period}교시`;
};

interface Props {
  fileName: string;
  timetable: TimetableResult;
  workbook: ParsedWorkbook;
  onClose: () => void;
  onApply: (plan: ParsedWorkbook['plan'], summary: string, details: string[]) => void;
}

/** 가져오기 전 확인: 시간표와 지금 시험 계획을 비교해 추가·변경·삭제를 보여준다 */
export function PlanImportDialog({ fileName, timetable, workbook, onClose, onApply }: Props) {
  const cmp = useMemo(() => comparePlan(workbook, timetable.entries, timetable.grades), [workbook, timetable]);
  const [show, setShow] = useState<'diff' | 'all'>('diff');
  const shown = show === 'diff' ? cmp.rows.filter((r) => r.status !== 'same') : cmp.rows;
  const noColumn = cmp.rows.filter((r) => r.noColumn && r.status !== 'removed');
  const untouched = [...new Set(workbook.plan.map((p) => p.grade))].filter((g) => !timetable.grades.includes(g));
  const nothing = cmp.counts.added + cmp.counts.changed + cmp.counts.removed === 0;

  const apply = () => {
    const details = cmp.rows
      .filter((r) => r.status !== 'same')
      .map((r) =>
        r.status === 'changed'
          ? `[변경] ${slot(r)} ${r.grade} ${r.subject} — ${r.changes.join(', ')}`
          : `[${STATUS[r.status].label}] ${slot(r)} ${r.grade} ${r.subject}`,
      );
    onApply(
      cmp.merged,
      `${fileName} — 추가 ${cmp.counts.added}, 변경 ${cmp.counts.changed}, 삭제 ${cmp.counts.removed} (${timetable.grades.join('·')})`,
      details,
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>한글 시간표로 시험 계획 가져오기</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2">
            <b>{fileName}</b>에서 {timetable.grades.join('·')} 시험 <b>{timetable.entries.length}건</b>을 읽었습니다. 적용하면{' '}
            <b>{timetable.grades.join('·')}</b>의 시험 계획이 시간표 내용으로 바뀝니다
            {untouched.length > 0 && <> ({untouched.join('·')}은 그대로)</>}. 적용 후 위의 '저장'을 눌러야 서버에 남습니다.
          </Typography>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {(['added', 'changed', 'removed', 'same'] as ImportStatus[]).map((s) => (
              <Chip key={s} size="small" color={STATUS[s].color} variant={s === 'same' ? 'outlined' : 'filled'} label={`${STATUS[s].label} ${cmp.counts[s]}`} />
            ))}
            <Box sx={{ flex: 1 }} />
            <ToggleButtonGroup size="small" exclusive value={show} onChange={(_, v) => v && setShow(v)}>
              <ToggleButton value="diff">바뀌는 것만</ToggleButton>
              <ToggleButton value="all">전체</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {timetable.issues.map((m, i) => (
            <Alert key={i} severity="warning" sx={{ py: 0 }}>
              {m}
            </Alert>
          ))}
          {noColumn.length > 0 && (
            <Alert severity="warning" sx={{ py: 0 }}>
              학년 명렬에 과목 열이 없어 현황표를 만들 수 없는 시험 {noColumn.length}건:{' '}
              {noColumn.map((r) => `${r.grade} ${r.subject}`).join(', ')} — 과목명 표기가 다르면 학년 탭에서 열 이름을 맞춰 주세요.
            </Alert>
          )}
          {nothing && <Alert severity="success">지금 시험 계획이 시간표와 같습니다.</Alert>}

          <Box sx={{ maxHeight: '52vh', overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f1f5f2', fontWeight: 700 } }}>
                  <TableCell sx={{ width: 70 }}>구분</TableCell>
                  <TableCell sx={{ width: 110 }}>날짜·교시</TableCell>
                  <TableCell sx={{ width: 70 }}>학년</TableCell>
                  <TableCell>과목 (코드)</TableCell>
                  <TableCell>시험시간</TableCell>
                  <TableCell>바뀌는 내용 / 시간표 원문</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map((r, i) => {
                  const p = r.entry ?? r.current!;
                  return (
                    <TableRow key={i} sx={r.status === 'removed' ? { '& td': { color: 'text.disabled', textDecoration: 'line-through' } } : undefined}>
                      <TableCell sx={{ textDecoration: 'none !important' }}>
                        <Chip size="small" color={STATUS[r.status].color} variant={r.status === 'same' ? 'outlined' : 'filled'} label={STATUS[r.status].label} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{slot(r)}</TableCell>
                      <TableCell>{r.grade}</TableCell>
                      <TableCell>
                        {p.subject} {p.code && <Typography component="span" variant="caption" color="text.secondary">({p.code})</Typography>}
                        {r.entry?.essay && <Chip size="small" label="서답형" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: 10.5 }} />}
                        {r.noColumn && r.status !== 'removed' && <Chip size="small" color="warning" label="명렬에 열 없음" sx={{ ml: 0.5, height: 18, fontSize: 10.5 }} />}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {p.timeRange} {p.minutes && <Typography component="span" variant="caption" color="text.secondary">({p.minutes}분)</Typography>}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12.5 }}>
                        {r.status === 'changed' ? r.changes.join(', ') : r.status === 'removed' ? '시간표에 없음' : <span style={{ color: '#6b7770' }}>{r.entry?.scope}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disabled={nothing} onClick={apply}>
          시험 계획에 적용 (저장 전)
        </Button>
      </DialogActions>
    </Dialog>
  );
}
