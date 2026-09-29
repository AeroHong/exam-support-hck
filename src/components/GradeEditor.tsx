import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PostAddIcon from '@mui/icons-material/PostAdd';
import FindReplaceIcon from '@mui/icons-material/FindReplace';
import CloseIcon from '@mui/icons-material/Close';
import type { CellKind, GradeSheet, ParsedWorkbook } from '../core';
import {
  addStudent,
  addSubject,
  cellText,
  makeHakbeon,
  parseRoomCell,
  removeStudent,
  removeSubject,
  replaceInColumn,
  setRoomCell,
  setStudentField,
  type StudentField,
} from '../core';
import { GridEditor, type CellChange, type GridColumn } from './GridEditor';

const FIELDS: { key: StudentField; label: string; width: number; numeric?: boolean }[] = [
  { key: 'ban', label: '반', width: 44, numeric: true },
  { key: 'num', label: '번호', width: 50, numeric: true },
  { key: 'name', label: '이름', width: 80 },
  { key: 'gender', label: '성별', width: 48 },
];

/** 셀 값 유형별 색 (고사실 규칙 — src/core/roomCell.ts) */
const KIND_STYLE: Partial<Record<CellKind | 'excludedText', { bg: string; color?: string; label: string }>> = {
  doum: { bg: '#fff3e0', color: '#a15c00', label: '도움실' },
  separate: { bg: '#f3e5f5', color: '#6a1b9a', label: '별도실' },
  waiting: { bg: '#e3f2fd', color: '#1565c0', label: '대기실' },
  excludedText: { bg: '#f5f5f5', color: '#9e9e9e', label: '제외(하교 등)' },
  unknownOwner: { bg: '#ffebee', color: '#c62828', label: '소속 미확인(?)' },
  unrecognized: { bg: '#ffebee', color: '#c62828', label: '알 수 없는 값' },
};

interface Props {
  sheet: GradeSheet;
  canEdit: boolean;
  onEdit: (fn: (wb: ParsedWorkbook) => ParsedWorkbook) => void;
}

export function GradeEditor({ sheet, canEdit, onEdit }: Props) {
  const grade = sheet.grade;
  const [ban, setBan] = useState<number | ''>('');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const bans = useMemo(() => [...new Set(sheet.students.map((s) => s.ban))].sort((a, b) => a - b), [sheet.students]);

  // 화면에 보이는 행 → 실제 학생 인덱스
  const visible = useMemo(() => {
    const q = query.trim();
    return sheet.students
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (ban === '' || s.ban === ban) && (!q || s.name.includes(q) || makeHakbeon(grade, s.ban, s.num).includes(q)))
      .map(({ i }) => i);
  }, [sheet.students, ban, query, grade]);

  const columns: GridColumn[] = useMemo(
    () => [
      ...FIELDS.map((f) => ({ key: f.key, label: f.label, width: f.width, numeric: f.numeric, sticky: true })),
      ...sheet.headers.map((h) => ({
        key: `s:${h}`,
        width: 104,
        label: (
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={h}>
              {h}
            </span>
            {canEdit && (
              <IconButton
                size="small"
                aria-label={`${h} 열 삭제`}
                sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
                onClick={() => {
                  if (window.confirm(`'${h}' 열을 삭제할까요? (되돌리기로 복구할 수 있습니다)`)) onEdit((wb) => removeSubject(wb, grade, h));
                }}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            )}
          </Stack>
        ),
      })),
    ],
    [sheet.headers, canEdit, onEdit, grade],
  );

  const getText = useCallback(
    (row: number, col: number) => {
      const s = sheet.students[visible[row]];
      if (!s) return '';
      if (col < FIELDS.length) return String(s[FIELDS[col].key] ?? '');
      return cellText(s.cells[sheet.headers[col - FIELDS.length]]);
    },
    [sheet, visible],
  );

  const getStyle = useCallback(
    (row: number, col: number) => {
      if (col < FIELDS.length) return undefined;
      const s = sheet.students[visible[row]];
      const v = s?.cells[sheet.headers[col - FIELDS.length]];
      if (v === null || v === undefined) return undefined;
      const parsed = parseRoomCell(v);
      const st = parsed ? KIND_STYLE[parsed.kind] : KIND_STYLE.excludedText;
      return st ? { bg: st.bg, color: st.color, title: st.label } : undefined;
    },
    [sheet, visible],
  );

  const onChange = useCallback(
    (changes: CellChange[]) => {
      if (!canEdit) return;
      onEdit((wb) =>
        changes.reduce((acc, { row, col, text }) => {
          const index = visible[row];
          if (index === undefined) return acc;
          if (col < FIELDS.length) return setStudentField(acc, grade, index, FIELDS[col].key, text);
          return setRoomCell(acc, grade, index, sheet.headers[col - FIELDS.length], text);
        }, wb),
      );
    },
    [canEdit, onEdit, visible, grade, sheet.headers],
  );

  const rowAction = useCallback(
    (row: number) =>
      canEdit ? (
        <IconButton
          size="small"
          aria-label="학생 삭제"
          sx={{ opacity: 0.35, '&:hover': { opacity: 1, color: 'error.main' } }}
          onClick={() => {
            const s = sheet.students[visible[row]];
            if (s && window.confirm(`${makeHakbeon(grade, s.ban, s.num)} ${s.name} 학생을 삭제할까요?`)) {
              onEdit((wb) => removeStudent(wb, grade, visible[row]));
            }
          }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      ) : null,
    [canEdit, onEdit, sheet.students, visible, grade],
  );

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
        <TextField select size="small" label="반" value={ban} onChange={(e) => setBan(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 110 }}>
          <MenuItem value="">전체</MenuItem>
          {bans.map((b) => (
            <MenuItem key={b} value={b}>
              {b}반
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          placeholder="이름 또는 학번"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ width: 200 }}
        />
        <Typography variant="body2" color="text.secondary">
          {visible.length} / {sheet.students.length}명
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <>
            <Button size="small" startIcon={<FindReplaceIcon />} onClick={() => setReplaceOpen(true)}>
              찾아 바꾸기
            </Button>
            <Button size="small" startIcon={<PostAddIcon />} onClick={() => setSubjectOpen(true)}>
              과목 열 추가
            </Button>
            <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setAddOpen(true)}>
              학생 추가
            </Button>
          </>
        )}
      </Stack>

      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          칸 색상:
        </Typography>
        {Object.entries(KIND_STYLE)
          .filter(([k]) => k !== 'unknownOwner')
          .map(([k, v]) => (
            <Chip key={k} size="small" label={k === 'unrecognized' ? '확인 필요' : v!.label} sx={{ bgcolor: v!.bg, color: v!.color, height: 22 }} />
          ))}
        <Tooltip title="칸을 클릭하고 바로 입력하거나 Enter로 수정합니다. 방향키로 이동, Delete로 지우기, 엑셀에서 복사한 범위를 Ctrl+V로 붙여넣을 수 있습니다. Ctrl+Z로 되돌립니다.">
          <Typography variant="caption" color="primary" sx={{ ml: 1, cursor: 'help', textDecoration: 'underline dotted' }}>
            사용법
          </Typography>
        </Tooltip>
      </Stack>

      {notice && (
        <Alert severity="info" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <GridEditor
        columns={columns}
        rowCount={visible.length}
        getText={getText}
        getStyle={getStyle}
        onChange={onChange}
        rowAction={canEdit ? rowAction : undefined}
      />

      <AddStudentDialog
        open={addOpen}
        grade={grade}
        bans={bans}
        onClose={() => setAddOpen(false)}
        onAdd={(st) => {
          onEdit((wb) => addStudent(wb, grade, st));
          setAddOpen(false);
          setBan(st.ban);
          setNotice(`${makeHakbeon(grade, st.ban, st.num)} ${st.name} 학생을 추가했습니다. 과목별 고사실을 입력하세요.`);
        }}
      />
      <AddSubjectDialog
        open={subjectOpen}
        existing={sheet.headers}
        onClose={() => setSubjectOpen(false)}
        onAdd={(name) => {
          onEdit((wb) => addSubject(wb, grade, name));
          setSubjectOpen(false);
          setNotice(`'${name}' 열을 추가했습니다. 시험 계획에도 이 과목을 추가해야 현황표가 만들어집니다.`);
        }}
      />
      <ReplaceDialog
        open={replaceOpen}
        headers={sheet.headers}
        onClose={() => setReplaceOpen(false)}
        onReplace={(subject, from, to) => {
          let count = 0;
          onEdit((wb) => {
            const r = replaceInColumn(wb, grade, subject, from, to);
            count = r.count;
            return r.count ? r.wb : wb;
          });
          setReplaceOpen(false);
          setNotice(count ? `'${from}' → '${to || '(빈칸)'}' ${count}칸을 바꿨습니다.` : `'${from}' 값을 찾지 못했습니다.`);
        }}
      />
    </Stack>
  );
}

function AddStudentDialog({
  open,
  grade,
  bans,
  onClose,
  onAdd,
}: {
  open: boolean;
  grade: string;
  bans: number[];
  onClose: () => void;
  onAdd: (s: { ban: number; num: number; name: string; gender: string }) => void;
}) {
  const [ban, setBan] = useState('');
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState('남');
  const valid = Number(ban) > 0 && Number(num) > 0 && name.trim() !== '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{grade} 학생 추가</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={1}>
            <TextField select label="반" size="small" value={ban} onChange={(e) => setBan(e.target.value)} sx={{ flex: 1 }}>
              {bans.map((b) => (
                <MenuItem key={b} value={String(b)}>
                  {b}반
                </MenuItem>
              ))}
            </TextField>
            <TextField label="번호" size="small" type="number" value={num} onChange={(e) => setNum(e.target.value)} sx={{ flex: 1 }} />
          </Stack>
          <TextField label="이름" size="small" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField select label="성별" size="small" value={gender} onChange={(e) => setGender(e.target.value)}>
            <MenuItem value="남">남</MenuItem>
            <MenuItem value="여">여</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          disabled={!valid}
          onClick={() => {
            onAdd({ ban: Number(ban), num: Number(num), name: name.trim(), gender });
            setNum('');
            setName('');
          }}
        >
          추가
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddSubjectDialog({
  open,
  existing,
  onClose,
  onAdd,
}: {
  open: boolean;
  existing: string[];
  onClose: () => void;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const dup = existing.includes(name.trim());
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>과목 열 추가</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="과목명"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={dup}
          helperText={dup ? '이미 있는 과목입니다.' : '시험 계획의 과목명과 같게 입력하세요.'}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || dup}
          onClick={() => {
            onAdd(name.trim());
            setName('');
          }}
        >
          추가
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReplaceDialog({
  open,
  headers,
  onClose,
  onReplace,
}: {
  open: boolean;
  headers: string[];
  onClose: () => void;
  onReplace: (subject: string | null, from: string, to: string) => void;
}) {
  const [subject, setSubject] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>찾아 바꾸기</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select size="small" label="과목 열" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <MenuItem value="">모든 과목</MenuItem>
            {headers.map((h) => (
              <MenuItem key={h} value={h}>
                {h}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="찾을 값 (칸 전체가 같은 것만)" placeholder="예: 2-3" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField size="small" label="바꿀 값 (비우면 빈칸)" placeholder="예: 교과3" value={to} onChange={(e) => setTo(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disabled={!from.trim()} onClick={() => onReplace(subject || null, from.trim(), to)}>
          바꾸기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
