import { useState } from 'react';
import { Alert, Box, Button, Chip, Collapse, Paper, Stack, Typography } from '@mui/material';
import type { Issue } from '../core';

const LEVELS = [
  { level: 'error', label: '오류', color: 'error' },
  { level: 'warn', label: '경고', color: 'warning' },
  { level: 'info', label: '참고', color: 'info' },
] as const;

/** 현황표를 만들기 전에 확인할 데이터·계획 문제 */
export function IssuesPanel({ issues }: { issues: Issue[] }) {
  const hasProblem = issues.some((i) => i.level !== 'info');
  const [open, setOpen] = useState(hasProblem);

  if (issues.length === 0) {
    return <Alert severity="success">데이터 검증 결과 문제가 없습니다.</Alert>;
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          데이터 검증
        </Typography>
        {LEVELS.map(({ level, label, color }) => {
          const n = issues.filter((i) => i.level === level).length;
          return n > 0 ? <Chip key={level} size="small" color={color} label={`${label} ${n}`} /> : null;
        })}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setOpen(!open)}>
          {open ? '접기' : '자세히'}
        </Button>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          {LEVELS.flatMap(({ level, color }) =>
            issues
              .filter((i) => i.level === level)
              .map((i, idx) => (
                <Alert key={`${level}-${idx}`} severity={color} sx={{ py: 0 }}>
                  {i.message}
                </Alert>
              )),
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
