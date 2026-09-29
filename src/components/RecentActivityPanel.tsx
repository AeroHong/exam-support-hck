import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { Box, Button, Chip, Collapse, Link, Paper, Stack, Typography, useMediaQuery } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { ACTIONS, subscribeRecentActivity, type ActivityLog } from '../firebase/activity';
import { ACTION_COLOR, changeDetail, relativeTime } from './activityStyle';

const COUNT = 4; // 최신 1건 + 이전 3건
const PANEL_W = 228;
const EDGE = 12; // 화면 오른쪽 끝과의 간격
// 본문(최대 1400px) 옆에 패널을 둘 자리가 있을 때만 옆에 고정(1920px 모니터 포함), 아니면 위쪽 떠 있는 표시
const WIDE = `(min-width: ${1400 + (PANEL_W + EDGE + 8) * 2}px)`;
const ALERT_MS = 2000; // 새 활동이 오면 펼쳐 보여주는 시간

/** 최근 활동 — 넓은 화면은 옆 패널, 좁은 화면은 위쪽에 떠 있는 한 줄(새 활동이 오면 잠깐 펼침) */
export function RecentActivityPanel() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now());
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

  return wide ? <SidePanel logs={logs} error={error} now={now} /> : <TopTicker logs={logs} error={error} now={now} />;
}

interface ViewProps {
  logs: ActivityLog[];
  error: boolean;
  now: number;
}

/** 한 건: 수정자 · 활동 · 시각 (+ 데이터 저장이면 수정 내용) */
function Item({ l, now, highlight, dense }: { l: ActivityLog; now: number; highlight?: boolean; dense?: boolean }) {
  const change = changeDetail(l);
  return (
    <Box
      sx={{
        p: dense ? 0.75 : 1,
        borderRadius: 1,
        border: '1px solid',
        borderColor: highlight ? 'primary.light' : 'divider',
        bgcolor: highlight ? '#f1f8f3' : 'transparent',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }} title={l.email}>
          {l.name || l.email}
        </Typography>
        <Chip
          size="small"
          color={ACTION_COLOR[l.action] ?? 'default'}
          variant={ACTION_COLOR[l.action] ? 'filled' : 'outlined'}
          label={ACTIONS[l.action] ?? l.action}
          sx={{ height: 18, fontSize: 10.5 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
          {relativeTime(l.at, now)}
        </Typography>
      </Stack>
      {change && (
        <Typography
          variant="caption"
          title={[l.summary, ...(l.details ?? []).slice(0, 10)].join('\n')}
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
            wordBreak: 'break-all',
            mt: 0.25,
            color: 'text.primary',
          }}
        >
          {change}
        </Typography>
      )}
      {l.examId && !dense && (
        <Link component={RouterLink} to={`/exams/${l.examId}/work`} variant="caption" underline="hover" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
          {l.examTitle || l.examId}
        </Link>
      )}
    </Box>
  );
}

function LiveDot({ error }: { error: boolean }) {
  return (
    <Box
      component="span"
      title={error ? '실시간 연결 끊김' : '실시간'}
      sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: error ? 'error.main' : 'success.main', display: 'inline-block', flexShrink: 0 }}
    />
  );
}

/** 넓은 화면: 본문 오른쪽 빈 영역에 고정 */
function SidePanel({ logs, error, now }: ViewProps) {
  return (
    <Box sx={{ position: 'fixed', top: 64, right: EDGE, zIndex: 4, '@media print': { display: 'none' } }}>
      <Paper variant="outlined" sx={{ width: PANEL_W, p: 1.5, bgcolor: 'rgba(255,255,255,0.96)' }}>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1, gap: 0.75 }}>
          <HistoryIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            최근 활동
          </Typography>
          <LiveDot error={error} />
        </Stack>
        {logs.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            {error ? '불러오지 못했습니다.' : '아직 기록이 없습니다.'}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {logs.map((l, i) => (
              <Item key={l.id} l={l} now={now} highlight={i === 0} />
            ))}
          </Stack>
        )}
        <Button component={RouterLink} to="/activity" size="small" fullWidth sx={{ mt: 1 }}>
          전체 보기
        </Button>
      </Paper>
    </Box>
  );
}

/** 좁은 화면: 위쪽 가운데 떠 있는 한 줄. 새 활동이 오면 잠깐 펼치고, 클릭하면 펼친 채로 고정 */
function TopTicker({ logs, error, now }: ViewProps) {
  const navigate = useNavigate();
  const [pinned, setPinned] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [hover, setHover] = useState(false);
  const lastId = useRef<string | null>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const latest = logs[0];
  const latestId = latest?.id ?? null;

  // 처음 불러온 것은 알리지 않고, 그 뒤 '새' 활동(id가 바뀜)이 오면 잠깐 펼친다.
  // 같은 기록이 다시 전달돼도(서버 시각 확정 등) 타이머를 건드리지 않도록 id만 본다.
  useEffect(() => {
    if (!latestId) return;
    if (lastId.current !== null && lastId.current !== latestId) {
      setAlerting(true);
      clearTimeout(alertTimer.current);
      alertTimer.current = setTimeout(() => setAlerting(false), ALERT_MS);
    }
    lastId.current = latestId;
  }, [latestId]);

  useEffect(() => () => clearTimeout(alertTimer.current), []);

  /** 한 줄을 눌렀을 때: 펼쳐져 있으면 무조건 접고(마우스가 올라가 있어도), 접혀 있으면 펼쳐 고정 */
  const toggle = () => {
    if (pinned || alerting || hover) {
      setPinned(false);
      setAlerting(false);
      clearTimeout(alertTimer.current);
      setHover(false);
    } else {
      setPinned(true);
    }
  };

  if (!latest) return null;
  const expanded = pinned || alerting || hover;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 54,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        width: expanded ? 'min(440px, calc(100vw - 24px))' : 'auto',
        maxWidth: 'calc(100vw - 24px)',
        '@media print': { display: 'none' },
      }}
      // 마우스를 올리면 바로 펼치고, 펼쳐진 영역을 벗어나면 (고정·새 활동 알림이어도) 바로 닫는다
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPinned(false);
        setAlerting(false);
        clearTimeout(alertTimer.current);
      }}
    >
      <Paper
        elevation={0}
        sx={{
          borderRadius: expanded ? 2 : 99,
          border: '1px solid',
          borderColor: alerting ? 'primary.main' : 'divider',
          bgcolor: 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(6px)',
          boxShadow: alerting ? '0 6px 24px rgba(46,125,50,0.28)' : '0 4px 16px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          transition: 'box-shadow .3s, border-color .3s, border-radius .2s',
        }}
      >
        {/* 한 줄: ● 수정자 · 수정 내용 · 시각 */}
        <Stack
          direction="row"
          onClick={toggle}
          sx={{ alignItems: 'center', gap: 1, px: 1.5, py: 0.75, cursor: 'pointer', minWidth: 0 }}
          title="눌러서 최근 활동 펼치기/접기"
        >
          <LiveDot error={error} />
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {latest.name || latest.email}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0, maxWidth: expanded ? 'none' : 'min(46vw, 420px)', flex: expanded ? 1 : 'none' }}>
            {changeDetail(latest) ?? ACTIONS[latest.action] ?? latest.action}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {relativeTime(latest.at, now)}
          </Typography>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Stack>

        <Collapse in={expanded} unmountOnExit>
          <Stack spacing={0.75} sx={{ px: 1.25, pb: 1.25 }}>
            {logs.slice(1).map((l) => (
              <Item key={l.id} l={l} now={now} dense />
            ))}
            <Button
              size="small"
              onClick={() => {
                setPinned(false);
                navigate('/activity');
              }}
            >
              활동 기록 전체 보기
            </Button>
          </Stack>
        </Collapse>
      </Paper>
    </Box>
  );
}
