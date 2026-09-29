import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Box, Button, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import UndoIcon from '@mui/icons-material/Undo';
import RestoreIcon from '@mui/icons-material/Restore';
import { VersionDrawer } from '../components/VersionDrawer';
import type { AppUser } from '../firebase/auth';
import { firebaseConfigured } from '../firebase/app';
import { logActivity } from '../firebase/activity';
import { saveExam } from '../firebase/repo';
import { useExamStore } from '../store/examStore';
import { diffWorkbook, exportWorkbook, parseWorkbook } from '../core';
import { IssuesPanel } from '../components/IssuesPanel';
import { GradeEditor } from '../components/GradeEditor';
import { PlanEditor } from '../components/PlanEditor';
import { useOpenIssue, type EditFocus } from '../components/useOpenIssue';

/** 시험 자료의 원본 데이터(시험 계획·학년별 명렬)를 웹에서 고치는 화면 */
export function EditPage({ user }: { user: AppUser }) {
  const { workbook, issues, title, examId, vacancies, saved, version, history, edit, undo, openExam } = useExamStore();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'plan');
  const openIssue = useOpenIssue(examId);

  // 데이터 검증에서 눌러 이동해 온 위치 (?tab=3학년&subject=확률과통계&hakbeon=30504&n=…)
  const nonce = params.get('n');
  const focus: EditFocus | undefined = useMemo(() => {
    if (!nonce) return undefined;
    const row = params.get('row');
    return {
      nonce,
      row: row !== null ? Number(row) : undefined,
      subject: params.get('subject') ?? undefined,
      hakbeon: params.get('hakbeon') ?? undefined,
    };
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = params.get('tab');
    if (nonce && t) setTab(t);
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ctrl+Z 되돌리기 (입력칸에서 글자 되돌리기는 브라우저 기본 동작 유지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const t = e.target as HTMLElement;
        // 표의 칸 입력창은 이동 모드(빈 값)일 때만 데이터 되돌리기로 쓴다
        const gridIdle = t.getAttribute('aria-label') === '칸 편집' && (t as HTMLInputElement).value === '';
        if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !gridIdle) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  if (!workbook || !examId) return null;

  const download = () => {
    const blob = new Blob([exportWorkbook(workbook)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileName = `${title || '응시현황'} 응시현황(수정).xlsx`.replace(/[\\/:*?"<>|]/g, '_');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    logActivity({ action: 'download_source', examId, examTitle: title, summary: fileName });
  };

  /** 새 엑셀 파일로 이 시험 자료의 데이터를 통째로 바꾼다 (바로 저장·기록) */
  const replace = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm(`'${file.name}' 파일 내용으로 이 시험 자료의 시험 계획·명렬을 모두 바꿀까요?\n(저장하지 않은 수정 내용은 사라집니다. 결번 목록은 유지됩니다.)`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const next = parseWorkbook(new Uint8Array(await file.arrayBuffer()));
      const diff = diffWorkbook(saved?.workbook ?? null, next);
      let nextVersion = version;
      if (firebaseConfigured) {
        nextVersion = await saveExam(examId, { title, sourceFileName: file.name, workbook: next, vacancies }, {
          by: user.email,
          byName: user.name,
          action: 'exam_replace',
          summary: `${file.name}로 교체 — ${diff.summary}`,
          details: diff.lines,
          version,
          baseline: saved ? { title: saved.title, sourceFileName: file.name, workbook: saved.workbook, vacancies: saved.vacancies } : undefined,
        });
      }
      openExam(examId, { title, sourceFileName: file.name, workbook: next, vacancies, ...nextVersion });
      setMsg({ kind: 'success', text: `'${file.name}'로 교체했습니다 — ${diff.summary}` });
    } catch (e) {
      setMsg({ kind: 'error', text: `교체 실패: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const sheet = workbook.grades.find((g) => g.grade === tab);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {firebaseConfigured && (
          <Button variant="outlined" size="small" startIcon={<RestoreIcon />} onClick={() => setVersionsOpen(true)}>
            버전 기록{version.versionCount ? ` (v${version.versionCount})` : ''}
          </Button>
        )}
        <Button size="small" startIcon={<UndoIcon />} disabled={!history.length} onClick={undo} title="저장하기 전 수정을 한 단계씩 취소 (Ctrl+Z)">
          실행 취소{history.length ? ` (${history.length})` : ''}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<DownloadIcon />} onClick={download}>
          엑셀로 내려받기
        </Button>
        <Button size="small" startIcon={<UploadFileIcon />} disabled={busy} onClick={() => fileRef.current?.click()}>
          엑셀 파일로 교체
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => {
            replace(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Stack>
      {msg && (
        <Alert severity={msg.kind} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      <IssuesPanel issues={issues} storeKey={examId} onOpen={openIssue} />
      {firebaseConfigured && <VersionDrawer open={versionsOpen} onClose={() => setVersionsOpen(false)} userEmail={user.email} />}

      <Paper variant="outlined" sx={{ px: 2, pt: 1, pb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="plan" label={`시험 계획 (${workbook.plan.length})`} />
          {workbook.grades.map((g) => (
            <Tab key={g.grade} value={g.grade} label={`${g.grade} (${g.students.length}명)`} />
          ))}
        </Tabs>
        {tab === 'plan' ? (
          <PlanEditor workbook={workbook} canEdit onEdit={edit} focus={focus} />
        ) : (
          sheet && <GradeEditor key={sheet.grade} sheet={sheet} canEdit onEdit={edit} focus={focus} />
        )}
        {errorCount > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="error">
              오류 {errorCount}건이 있는 시험은 현황표를 만들지 않습니다. 위 '데이터 검증'을 확인하세요.
            </Typography>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
