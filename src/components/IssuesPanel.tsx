import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { Issue, IssueLink } from '../core';

const LEVELS = [
  { level: 'error', label: '오류', color: 'error' },
  { level: 'warn', label: '경고', color: 'warning' },
  { level: 'info', label: '참고', color: 'info' },
] as const;

/** 확인한 '참고'는 숨긴다 — 시험 자료별로 이 브라우저에만 기억(개인 편의) */
function useHiddenInfo(storeKey: string | undefined) {
  const key = storeKey ? `hiddenInfo:${storeKey}` : null;
  const read = (): string[] => {
    if (!key) return [];
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
    } catch {
      return [];
    }
  };
  const [hidden, setHidden] = useState<string[]>(read);
  useEffect(() => setHidden(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: string[]) => {
    setHidden(next);
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* 저장 못 해도 이번 화면에서는 숨김 유지 */
    }
  };
  return { hidden, hide: (m: string) => save([...new Set([...hidden, m])]), reset: () => save([]) };
}

/**
 * 데이터 검증 — 현황표를 만들기 전에 확인할 문제.
 * 오류·경고는 누르면 데이터 수정 화면의 해당 칸·행으로 이동, 참고는 ✓로 숨김.
 */
export function IssuesPanel({ issues, storeKey, onOpen }: { issues: Issue[]; storeKey?: string; onOpen?: (link: IssueLink) => void }) {
  const { hidden, hide, reset } = useHiddenInfo(storeKey);
  const visible = useMemo(() => issues.filter((i) => i.level !== 'info' || !hidden.includes(i.message)), [issues, hidden]);
  const hiddenCount = issues.length - visible.length;
  const hasProblem = issues.some((i) => i.level !== 'info');
  const [open, setOpen] = useState(hasProblem);

  if (visible.length === 0) {
    return (
      <Alert
        severity="success"
        action={
          hiddenCount > 0 && (
            <Button color="inherit" size="small" onClick={reset}>
              숨긴 참고 {hiddenCount}건 다시 보기
            </Button>
          )
        }
      >
        데이터 검증 결과 확인할 문제가 없습니다.
      </Alert>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          데이터 검증
        </Typography>
        {LEVELS.map(({ level, label, color }) => {
          const n = visible.filter((i) => i.level === level).length;
          return n > 0 ? <Chip key={level} size="small" color={color} label={`${label} ${n}`} /> : null;
        })}
        {onOpen && hasProblem && (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
            오류·경고를 누르면 고칠 곳으로 이동합니다
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {hiddenCount > 0 && (
          <Button size="small" color="inherit" onClick={reset} sx={{ color: 'text.secondary' }}>
            숨긴 참고 {hiddenCount}건 다시 보기
          </Button>
        )}
        <Button size="small" onClick={() => setOpen(!open)}>
          {open ? '접기' : '자세히'}
        </Button>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          {LEVELS.flatMap(({ level, color }) =>
            visible
              .filter((i) => i.level === level)
              .map((i, idx) => {
                const clickable = level !== 'info' && !!i.link && !!onOpen;
                return (
                  <Alert
                    key={`${level}-${idx}-${i.message}`}
                    severity={color}
                    onClick={clickable ? () => onOpen!(i.link!) : undefined}
                    sx={{
                      py: 0,
                      alignItems: 'center',
                      ...(clickable && {
                        cursor: 'pointer',
                        transition: 'filter .15s, box-shadow .15s',
                        '&:hover': { filter: 'brightness(0.97)', boxShadow: '0 0 0 1px rgba(0,0,0,0.12) inset' },
                      }),
                    }}
                    action={
                      level === 'info' ? (
                        <Tooltip title="확인 — 숨기기">
                          <IconButton size="small" color="inherit" aria-label="확인하고 숨기기" onClick={() => hide(i.message)}>
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : clickable ? (
                        <Stack direction="row" sx={{ alignItems: 'center', color: 'text.secondary', pr: 0.5 }}>
                          <Typography variant="caption">수정하기</Typography>
                          <ChevronRightIcon fontSize="small" />
                        </Stack>
                      ) : undefined
                    }
                  >
                    {i.message}
                  </Alert>
                );
              }),
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
