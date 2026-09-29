import { useEffect, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';

const CHECK_MS = 5 * 60_000;
const ASSET = /\/assets\/index-[\w-]+\.js/;

/** 지금 페이지가 쓰는 앱 파일 (개발 서버에서는 없음) */
function currentAsset(): string | null {
  const s = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].find((x) => ASSET.test(x.src));
  return s ? (s.src.match(ASSET)?.[0] ?? null) : null;
}

/**
 * 새 버전 배포 알림 — 창을 오래 열어 둔 채 옛 화면으로 저장하는 일을 막기 위해,
 * 5분마다·창으로 돌아올 때 서버의 index.html을 확인해 앱 파일이 바뀌었으면 새로고침을 권한다.
 */
export function UpdateNotice() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const mine = currentAsset();
    if (!mine) return;
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const latest = html.match(ASSET)?.[0];
        if (latest && latest !== mine) setStale(true);
      } catch {
        /* 네트워크 오류는 다음 확인 때 */
      }
    };
    const t = setInterval(check, CHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <Snackbar open={stale} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ top: { xs: 56, sm: 56 } }}>
      <Alert
        severity="info"
        variant="filled"
        action={
          <Button color="inherit" size="small" variant="outlined" onClick={() => window.location.reload()}>
            새로고침
          </Button>
        }
      >
        새 버전이 배포되었습니다. 저장한 뒤 새로고침하세요.
      </Alert>
    </Snackbar>
  );
}
