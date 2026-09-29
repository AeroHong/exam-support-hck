import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import DownloadIcon from '@mui/icons-material/Download';
import { exportWorkbook } from '../core';
import { listVersions, loadVersionData, type VersionAction, type VersionMeta } from '../firebase/repo';
import { logActivity } from '../firebase/activity';
import { useExamStore } from '../store/examStore';
import { useSaveExam } from '../store/useSaveExam';
import { relativeTime } from './activityStyle';

const ACTION_LABEL: Record<VersionAction, { label: string; color: 'primary' | 'warning' | 'secondary' | 'default' | 'info' }> = {
  baseline: { label: '기준 저장본', color: 'default' },
  exam_create: { label: '엑셀 업로드', color: 'info' },
  exam_save: { label: '저장', color: 'primary' },
  exam_replace: { label: '엑셀로 교체', color: 'warning' },
  exam_restore: { label: '버전 복구', color: 'secondary' },
};

const fullTime = (d?: Date) => (d ? d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'medium', hour12: false }) : '');

/**
 * 버전 기록 — 데이터가 바뀐 저장(업로드·저장·교체·복구)마다 남은 전체 데이터 스냅숏.
 * 골라서 복구하면 그 상태를 새 버전으로 저장한다(기존 버전은 그대로 남음).
 */
export function VersionDrawer({ open, onClose, userEmail }: { open: boolean; onClose: () => void; userEmail: string }) {
  const { examId, title, dirty, version } = useExamStore();
  const { restore, saving } = useSaveExam(userEmail);
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const refresh = useCallback(() => {
    if (!examId) return;
    setVersions(null);
    listVersions(examId)
      .then(setVersions)
      .catch((e) => {
        setVersions([]);
        setMsg({ kind: 'error', text: `버전 목록을 불러오지 못했습니다: ${e.message}` });
      });
  }, [examId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh, version.latestVersionId]);

  const doRestore = async (v: VersionMeta) => {
    const warn = dirty ? '\n\n저장하지 않은 수정 내용은 사라집니다.' : '';
    if (!window.confirm(`v${v.versionNo} (${fullTime(v.at)}, ${v.byName}) 상태로 되돌릴까요?\n복구한 상태는 새 버전으로 저장되고, 기존 버전은 그대로 남습니다.${warn}`)) return;
    setMsg(null);
    try {
      setMsg({ kind: 'success', text: await restore(v) });
    } catch (e) {
      setMsg({ kind: 'error', text: `복구 실패: ${(e as Error).message}` });
    }
  };

  const download = async (v: VersionMeta) => {
    if (!examId) return;
    try {
      const data = await loadVersionData(examId, v.id);
      const blob = new Blob([exportWorkbook(data.workbook)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `${data.title} v${v.versionNo}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      logActivity({ action: 'download_source', examId, examTitle: title, summary: `v${v.versionNo} 버전 엑셀 — ${fileName}`, versionId: v.id });
    } catch (e) {
      setMsg({ kind: 'error', text: `내려받기 실패: ${(e as Error).message}` });
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 460 } } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1.5 }}>
        <RestoreIcon sx={{ color: 'primary.main', mr: 1 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          버전 기록
        </Typography>
        <IconButton onClick={onClose} aria-label="닫기">
          <CloseIcon />
        </IconButton>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>
        데이터가 바뀐 저장(업로드·저장·교체·복구)마다 전체 데이터가 버전으로 남습니다. 버전을 골라 복구하면 그 상태가 <b>새 버전으로 저장</b>되고,
        기존 버전은 그대로 남아 언제든 다시 돌아갈 수 있습니다.
      </Typography>
      {dirty && (
        <Alert severity="warning" sx={{ mx: 2, mb: 1 }}>
          저장하지 않은 수정 내용이 있습니다. 복구하면 사라집니다.
        </Alert>
      )}
      {msg && (
        <Alert severity={msg.kind} sx={{ mx: 2, mb: 1 }} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}
      <Divider />

      <Box sx={{ overflowY: 'auto', flex: 1, p: 2 }}>
        {versions === null ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : versions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            아직 버전이 없습니다. 처음 저장하면 지금까지의 저장본이 v1(기준 저장본)으로, 저장한 내용이 v2로 남습니다.
          </Typography>
        ) : (
          <Stack spacing={1.25}>
            {versions.map((v) => {
              const current = v.id === version.latestVersionId;
              const a = ACTION_LABEL[v.action] ?? ACTION_LABEL.exam_save;
              const isOpen = expanded === v.id;
              return (
                <Box
                  key={v.id}
                  sx={{
                    border: '1px solid',
                    borderColor: current ? 'primary.main' : 'divider',
                    borderRadius: 1.5,
                    p: 1.5,
                    bgcolor: current ? '#f1f8f3' : '#fff',
                  }}
                >
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>v{v.versionNo}</Typography>
                    <Chip size="small" label={a.label} color={a.color} variant={a.color === 'default' ? 'outlined' : 'filled'} sx={{ height: 20, fontSize: 11 }} />
                    {current && <Chip size="small" label="현재" color="success" sx={{ height: 20, fontSize: 11 }} />}
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }} title={fullTime(v.at)}>
                      {relativeTime(v.at)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    <b>{v.byName}</b>{' '}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {fullTime(v.at)}
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-all' }}>
                    {v.summary}
                  </Typography>

                  {v.details.length > 0 && (
                    <>
                      <Button size="small" sx={{ px: 0.5, mt: 0.5 }} onClick={() => setExpanded(isOpen ? null : v.id)}>
                        {isOpen ? '변경 내역 접기' : `변경 내역 ${v.details.length}건 보기`}
                      </Button>
                      <Collapse in={isOpen} unmountOnExit>
                        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 12.5, lineHeight: 1.65, maxHeight: 240, overflowY: 'auto', bgcolor: '#fafbfa', borderRadius: 1, py: 1 }}>
                          {v.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </Box>
                      </Collapse>
                    </>
                  )}

                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant={current ? 'text' : 'outlined'}
                      startIcon={<RestoreIcon />}
                      disabled={current || saving}
                      onClick={() => doRestore(v)}
                    >
                      {current ? '지금 상태' : '이 버전으로 복구'}
                    </Button>
                    <Button size="small" startIcon={<DownloadIcon />} onClick={() => download(v)}>
                      엑셀로 받기
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
