import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { Badge, Box, Button, Chip, Fab, Link, Paper, Stack, Typography, useMediaQuery } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import CloseIcon from '@mui/icons-material/Close';
import { ACTIONS, subscribeRecentActivity, type ActivityLog } from '../firebase/activity';
import { ACTION_COLOR, relativeTime } from './activityStyle';

const COUNT = 4; // 최신 1건 + 이전 3건
const PANEL_W = 228;
const EDGE = 12; // 화면 오른쪽 끝과의 간격
// 본문(최대 1400px) 옆에 패널을 둘 자리가 있을 때만 고정 표시(1920px 모니터 포함), 아니면 접히는 버튼
const WIDE = `(min-width: ${1400 + (PANEL_W + EDGE + 8) * 2}px)`;

/** 최근 활동 — 화면 옆 빈 영역에 늘 보이는 실시간 패널 */
export function RecentActivityPanel() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  const [seenId, setSeenId] = useState<string | null>(null);
  const wide = useMediaQuery(WIDE);

  useEffect(
    () =>
      subscribeRecentActivity(
        COUNT,
        (xs) => {
          setLogs(xs);
          setError(false);
        },
        () => setError(true),
      ),
    [],
  );

  // "3분 전" 같은 상대 시각을 30초마다 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const latestId = logs[0]?.id ?? null;
  const unseen = !wide && !open && latestId !== null && latestId !== seenId;

  const body = (
    <Paper
      variant="outlined"
      sx={{
        width: PANEL_W,
        p: 1.5,
        bgcolor: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(4px)',
        boxShadow: wide ? 'none' : '0 6px 24px rgba(0,0,0,0.16)',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
        <HistoryIcon fontSize="small" sx={{ color: 'primary.main', mr: 0.75 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          최근 활동
        </Typography>
        <Box
          sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: error ? 'error.main' : 'success.main', mr: 1 }}
          title={error ? '실시간 연결 끊김' : '실시간'}
        />
        {!wide && (
          <Button size="small" sx={{ minWidth: 0, p: 0.25 }} onClick={() => setOpen(false)} aria-label="닫기">
            <CloseIcon fontSize="small" />
          </Button>
        )}
      </Stack>

      {logs.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          {error ? '불러오지 못했습니다.' : '아직 기록이 없습니다.'}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {logs.map((l, i) => (
            <Box
              key={l.id}
              sx={{
                p: 1,
                borderRadius: 1,
                border: '1px solid',
                borderColor: i === 0 ? 'primary.light' : 'divider',
                bgcolor: i === 0 ? '#f1f8f3' : 'transparent',
                opacity: i === 0 ? 1 : 0.85,
              }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Chip
                  size="small"
                  color={ACTION_COLOR[l.action] ?? 'default'}
                  variant={ACTION_COLOR[l.action] ? 'filled' : 'outlined'}
                  label={ACTIONS[l.action] ?? l.action}
                  sx={{ height: 20, fontSize: 11 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
                  {relativeTime(l.at, now)}
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap title={l.email}>
                {l.name || l.email}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                title={l.summary}
                sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35, wordBreak: 'break-all' }}
              >
                {l.summary}
              </Typography>
              {l.examId && (
                <Link
                  component={RouterLink}
                  to={`/exams/${l.examId}/work`}
                  variant="caption"
                  underline="hover"
                  noWrap
                  sx={{ display: 'block', mt: 0.25 }}
                >
                  {l.examTitle || l.examId}
                </Link>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <Button component={RouterLink} to="/activity" size="small" fullWidth sx={{ mt: 1 }} onClick={() => setOpen(false)}>
        전체 보기
      </Button>
    </Paper>
  );

  // 넓은 화면: 오른쪽 빈 영역에 고정
  if (wide) {
    return <Box sx={{ position: 'fixed', top: 64, right: EDGE, zIndex: 4, '@media print': { display: 'none' } }}>{body}</Box>;
  }

  // 좁은 화면: 오른쪽 아래 버튼 → 펼치기
  return (
    <Box sx={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1200, '@media print': { display: 'none' } }}>
      {open ? (
        body
      ) : (
        <Badge color="error" variant="dot" invisible={!unseen} overlap="circular">
          <Fab
            size="medium"
            color="primary"
            variant="extended"
            onClick={() => {
              setOpen(true);
              setSeenId(latestId);
            }}
            sx={{ boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}
          >
            <HistoryIcon sx={{ mr: 0.75 }} />
            최근 활동
          </Fab>
        </Badge>
      )}
    </Box>
  );
}
