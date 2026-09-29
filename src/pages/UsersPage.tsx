import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
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
import { addMembers, listMembers, removeMember, setMemberRole, type Member } from '../firebase/repo';
import type { MemberRole } from '../firebase/schema';

const ROLE_LABEL: Record<MemberRole, string> = { admin: '관리자', manager: '담당교사' };

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
 * 사용자·권한 관리 (관리자 전용).
 * smart-teachers-office의 AdminEvalPlanManagers와 같은 역할이지만, 이 앱에는 교직원 목록이 없어서
 * 이메일로 미리 지정한다 — 지정된 교사는 처음 로그인하는 순간 바로 사용할 수 있다.
 * 관리자는 다른 사람에게 관리자 권한을 줄 수 있다(본인 권한을 낮추거나 본인을 해제할 수는 없음).
 */
export function UsersPage({ user }: { user: AppUser }) {
  const [managers, setManagers] = useState<Member[]>([]);
  const [role, setRole] = useState<MemberRole>('manager');
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    listMembers()
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
      await addMembers(toAdd, role, { uid: user.uid, name: user.name }, {
        action: 'member_add',
        summary: `${ROLE_LABEL[role]} ${toAdd.length}명 지정`,
        details: toAdd,
      });
      const skipped = preview.valid.length - toAdd.length;
      setMsg({
        kind: preview.invalid.length ? 'warning' : 'success',
        text:
          `${toAdd.length}명을 ${ROLE_LABEL[role]}(으)로 지정했습니다.` +
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

  const isMe = (m: Member) => m.email === user.email.toLowerCase();

  const changeRole = async (m: Member, next: MemberRole) => {
    if (next === m.role) return;
    try {
      await setMemberRole(m.id, next, {
        action: 'member_role',
        summary: `${m.name || m.email}: ${ROLE_LABEL[m.role]} → ${ROLE_LABEL[next]}`,
      });
      refresh();
    } catch (e) {
      setMsg({ kind: 'error', text: `권한 변경 실패: ${(e as Error).message}` });
    }
  };

  const remove = async (m: Member) => {
    if (!window.confirm(`${m.name || m.email} 선생님의 사용 권한을 해제할까요? 바로 사용할 수 없게 됩니다.`)) return;
    try {
      await removeMember(m.id, { action: 'member_remove', summary: `${m.name || m.email} (${ROLE_LABEL[m.role]}) 해제` });
      refresh();
    } catch (e) {
      setMsg({ kind: 'error', text: `해제 실패: ${(e as Error).message}` });
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          사용자 관리
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          여기에 지정한 선생님만 로그인해서 사용할 수 있습니다. <b>담당교사</b>는 자료 삭제·사용자 관리를 뺀 모든 기능을, <b>관리자</b>는 모든 기능을
          씁니다. 아직 로그인한 적 없는 선생님도 이메일로 미리 지정해 두면 처음 로그인하는 순간 바로 사용할 수 있습니다.
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
          <TextField select size="small" label="권한" value={role} onChange={(e) => setRole(e.target.value as MemberRole)} sx={{ width: 120 }}>
            <MenuItem value="manager">담당교사</MenuItem>
            <MenuItem value="admin">관리자</MenuItem>
          </TextField>
          <Button variant="contained" startIcon={<PersonAddIcon />} disabled={busy || !toAdd.length} onClick={add} sx={{ mt: { md: 0.5 } }}>
            지정
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
            지정된 사용자가 없습니다.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>이름</TableCell>
                <TableCell>이메일</TableCell>
                <TableCell>권한</TableCell>
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
                    <TextField
                      select
                      size="small"
                      variant="standard"
                      value={m.role}
                      disabled={isMe(m)}
                      onChange={(e) => changeRole(m, e.target.value as MemberRole)}
                      slotProps={{ input: { disableUnderline: true } }}
                      title={isMe(m) ? '본인 권한은 바꿀 수 없습니다' : undefined}
                    >
                      <MenuItem value="manager">담당교사</MenuItem>
                      <MenuItem value="admin">관리자</MenuItem>
                    </TextField>
                  </TableCell>
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
                    <Tooltip title={isMe(m) ? '본인은 해제할 수 없습니다' : '해제'}>
                      <span>
                      <IconButton size="small" disabled={isMe(m)} onClick={() => remove(m)} sx={{ '&:hover': { color: 'error.main' } }}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Typography variant="caption" color="text.secondary">
        계정(users) 문서의 역할이 admin인 계정도 관리자입니다(smart-teachers-office와 같은 구조). 사용자 지정·권한 변경·해제는 모두 활동 기록에 남습니다.
      </Typography>
    </Stack>
  );
}
