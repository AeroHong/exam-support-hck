import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import type { ParsedWorkbook, PlanRow } from '../core';
import { addPlanRow, findSubjectColumn, removePlanRow, updatePlanRow } from '../core';

const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})$/;

/** 행별 문제 — 과목 열 없음, 시간 형식·역전 */
function rowProblems(p: PlanRow, wb: ParsedWorkbook): string[] {
  const out: string[] = [];
  const sheet = wb.grades.find((g) => g.grade === p.grade);
  if (!sheet) out.push(`'${p.grade} 응시현황' 시트가 없습니다.`);
  else if (p.subject && !findSubjectColumn(sheet.headers, p.subject)) out.push(`${p.grade} 응시현황에 '${p.subject}' 열이 없습니다.`);
  if (!p.subject) out.push('과목명을 입력하세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateStr)) out.push('날짜를 입력하세요.');
  const m = p.timeRange.match(TIME_RANGE);
  if (!m) out.push('시험시간은 08:20~09:10 형식으로 입력하세요.');
  else if (Number(m[3]) * 60 + Number(m[4]) <= Number(m[1]) * 60 + Number(m[2])) out.push('종료시각이 시작시각보다 빠릅니다.');
  return out;
}

/** 입력 중에는 로컬 상태만 바꾸고, 포커스를 벗어나거나 Enter를 누를 때 반영 (되돌리기 단위를 칸 하나로) */
function CommitField({
  value,
  onCommit,
  disabled,
  ...rest
}: { value: string; onCommit: (v: string) => void; disabled?: boolean } & Omit<React.ComponentProps<typeof TextField>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <TextField
      {...rest}
      disabled={disabled}
      value={draft}
      variant="standard"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
      slotProps={{ input: { disableUnderline: true, sx: { fontSize: 14 } } }}
    />
  );
}

interface Props {
  workbook: ParsedWorkbook;
  canEdit: boolean;
  onEdit: (fn: (wb: ParsedWorkbook) => ParsedWorkbook) => void;
}

export function PlanEditor({ workbook, canEdit, onEdit }: Props) {
  const grades = workbook.grades.map((g) => g.grade);
  const update = (i: number, patch: Partial<PlanRow>) => onEdit((wb) => updatePlanRow(wb, i, patch));

  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 960, '& td': { py: 0.25 }, '& th': { bgcolor: '#f1f5f2', color: '#24503a', fontWeight: 600 } }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 32 }} />
            <TableCell sx={{ width: 150 }}>날짜</TableCell>
            <TableCell sx={{ width: 70 }}>교시</TableCell>
            <TableCell sx={{ width: 100 }}>대상학년</TableCell>
            <TableCell>과목명</TableCell>
            <TableCell sx={{ width: 90 }}>과목코드</TableCell>
            <TableCell sx={{ width: 140 }}>시험시간</TableCell>
            <TableCell sx={{ width: 130 }}>시험시간(분)</TableCell>
            <TableCell sx={{ width: 80 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {workbook.plan.map((p, i) => {
            const problems = rowProblems(p, workbook);
            const headers = workbook.grades.find((g) => g.grade === p.grade)?.headers ?? [];
            return (
              <TableRow key={i} hover sx={problems.length ? { bgcolor: '#fff8f6' } : undefined}>
                <TableCell padding="none" align="center">
                  {problems.length > 0 && (
                    <Tooltip title={problems.join(' / ')}>
                      <ErrorOutlineIcon color="error" sx={{ fontSize: 18, verticalAlign: 'middle' }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <TextField
                    type="date"
                    variant="standard"
                    disabled={!canEdit}
                    value={p.dateStr}
                    onChange={(e) => update(i, { dateStr: e.target.value })}
                    slotProps={{ input: { disableUnderline: true, sx: { fontSize: 14 } } }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    variant="standard"
                    disabled={!canEdit}
                    value={p.period || ''}
                    onChange={(e) => update(i, { period: Number(e.target.value) })}
                    slotProps={{ input: { disableUnderline: true, sx: { fontSize: 14 } } }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <MenuItem key={n} value={n}>
                        {n}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    variant="standard"
                    disabled={!canEdit}
                    value={grades.includes(p.grade) ? p.grade : ''}
                    onChange={(e) => update(i, { grade: e.target.value })}
                    slotProps={{ input: { disableUnderline: true, sx: { fontSize: 14 } } }}
                  >
                    {grades.map((g) => (
                      <MenuItem key={g} value={g}>
                        {g}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <Autocomplete
                    freeSolo
                    disabled={!canEdit}
                    options={headers}
                    value={p.subject}
                    onChange={(_, v) => v !== null && v !== p.subject && update(i, { subject: v })}
                    onInputChange={(_, v, reason) => reason === 'blur' && v !== p.subject && update(i, { subject: v })}
                    renderInput={(params) => <TextField {...params} variant="standard" placeholder="과목 선택 또는 입력" />}
                  />
                </TableCell>
                <TableCell>
                  <CommitField disabled={!canEdit} value={p.code} onCommit={(v) => update(i, { code: v.trim() })} />
                </TableCell>
                <TableCell>
                  <CommitField disabled={!canEdit} value={p.timeRange} placeholder="08:20~09:10" onCommit={(v) => update(i, { timeRange: v.trim() })} />
                </TableCell>
                <TableCell>
                  <CommitField disabled={!canEdit} value={p.minutes} onCommit={(v) => update(i, { minutes: v.trim() })} />
                </TableCell>
                <TableCell padding="none" align="right" sx={{ pr: 1, whiteSpace: 'nowrap' }}>
                  {canEdit && (
                    <>
                      <Tooltip title="날짜·교시·학년·시간을 복사해 새 시험 추가(맨 아래)">
                        <IconButton size="small" onClick={() => onEdit((wb) => addPlanRow(wb, { ...p, subject: '', code: '' }))}>
                          <ContentCopyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="행 삭제">
                        <IconButton size="small" onClick={() => onEdit((wb) => removePlanRow(wb, i))} sx={{ '&:hover': { color: 'error.main' } }}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {canEdit && (
        <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onEdit((wb) => addPlanRow(wb))}>
            시험 추가
          </Button>
          <Typography variant="caption" color="text.secondary">
            과목명은 해당 학년 응시현황의 열 이름과 같아야 합니다(띄어쓰기·Ⅰ/1 차이는 자동으로 맞춥니다).
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
