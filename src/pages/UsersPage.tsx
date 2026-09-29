import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import CloseIcon from '@mui/icons-material/Close';
import type { AppUser } from '../firebase/auth';
import { ALLOWED_DOMAIN, firebaseConfigured } from '../firebase/app';
import { addManagers, listManagers, removeManager, type Manager } from '../firebase/repo';

/** 입력값 → 이메일 목록. 아이디만 쓰면 학교 도메인을 붙이고, 다른 도메인은 걸러낸다. */
function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    const email = t.includes('@') ? t : ALLOWED_DOMAIN ? `${t}@${ALLOWED_DOMAIN}` : t;
    const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && (!ALLOWED_DOMAIN || email.endsWith('@' + ALLOWED_DOMAIN.toLowerCase()));
    if (ok) valid.add(email);
    else invalid.push(raw);
  }
  return { valid: [...valid], invalid };
}

const fmt = (d?: Date) => (d ? d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '');

/**
 * 응시현황표 담당교사 지정 (관리자 전용).
 * smart-teachers-office의 AdminEvalPlanManagers와 같은 역할이지만, 이 앱에는 교직원 목록이 없어서
 * 이메일로 미리 지정한다 — 지정된 교사는 처음 로그인하는 순간 바로 사용할 수 있다.
 */
export function UsersPage({ user }: { user: AppUser }) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listManagers()
      .then(setManagers)
      .catch((e) => setMsg({ kind: 'error', text: `담당교사 목록을 불러오지 못했습니다: ${e.message}` }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);

  if (!firebaseConfigured || user.role !== 'admin') return <Navigate to="/" replace />;

  const preview = parseEmails(input);
  const existing = new Set(managers.map((m) => m.email));
  const toAdd = preview.valid.filter((e) => !existing.has(e));

  const add = async () => {
    if (!toAdd.length) return;
    setBusy(true);
    try {
      await addManagers(toAdd.map((email) => ({ email })), { uid: user.uid, name: user.name });
      const skipped = preview.valid.length - toAdd.length;
      setMsg({
        kind: preview.invalid.length ? 'warning' : 'success',
        text:
          `${toAdd.length}명을 담당교사로 지정했습니다.` +
          (skipped ? ` (이미 지정된 ${skipped}명 제외)` : '') +
          (preview.invalid.length ? ` 확인이 필요한 입력: ${preview.invalid.join(', ')}` : ''),
      });
      setInput('');
      refresh();
    } catch (e) {
      setMsg({ kind: 'error', text: `지정 실패: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Manager) => {
    if (!window.confirm(`${m.name || m.email} 선생님의 담당교사 지정을 해제할까요? 바로 사용할 수 없게 됩니다.`)) return;
    try {
      await removeManager(m.id);
      refresh();
    } catch (e) {
      setMsg({ kind: 'error', text: `해제 실패: ${(e as Error).message}` });
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          사용자 관리 — 응시현황표 담당교사
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          여기에 지정한 선생님만 로그인해서 사용할 수 있습니다(자료 삭제·사용자 관리는 관리자만). 아직 로그인한 적 없는 선생님도 이메일로 미리
          지정해 두면, 처음 로그인하는 순간 바로 사용할 수 있습니다.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'flex-start' } }}>
          <TextField
            multiline
            minRows={2}
            size="small"
            label="이메일"
            placeholder={`hong  kim${ALLOWED_DOMAIN ? `@${ALLOWED_DOMAIN}` : ''}\n여러 명은 줄바꿈·쉼표로 구분`}
            helperText={
              ALLOWED_DOMAIN
                ? `아이디만 쓰면 @${ALLOWED_DOMAIN}이 붙습니다.${input.trim() ? ` 새로 지정 ${toAdd.length}명` : ''}${preview.invalid.length ? ` · 확인 필요 ${preview.invalid.length}건` : ''}`
                : undefined
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button variant="contained" startIcon={<PersonAddIcon />} disabled={busy || !toAdd.length} onClick={add} sx={{ mt: { md: 0.5 } }}>
            담당교사 지정
          </Button>
        </Stack>
        {msg && (
          <Alert severity={msg.kind} sx={{ mt: 2 }} onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        )}
      </Paper>

      <Paper variant="outlined">
        {loading ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            불러오는 중…
          </Typography>
        ) : managers.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            지정된 담당교사가 없습니다.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>이름</TableCell>
                <TableCell>이메일</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>지정</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {managers.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{m.name || <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>}</TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    {m.lastLoginAt ? (
                      <Typography variant="body2">최근 접속 {fmt(m.lastLoginAt)}</Typography>
                    ) : (
                      <Chip size="small" variant="outlined" label="아직 로그인 안 함" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {m.addedByName} {fmt(m.addedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="지정 해제">
                      <IconButton size="small" onClick={() => remove(m)} sx={{ '&:hover': { color: 'error.main' } }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Typography variant="caption" color="text.secondary">
        관리자는 계정(users) 문서의 역할(admin)로 정해집니다 — smart-teachers-office와 같은 구조이며, 관리자 추가는 Firebase 콘솔에서 합니다.
      </Typography>
    </Stack>
  );
}
