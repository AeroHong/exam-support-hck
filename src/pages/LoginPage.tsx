import { useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import { ALLOWED_DOMAIN } from '../firebase/app';
import { signIn } from '../firebase/auth';

export function LoginPage({ error, onError }: { error: string | null; onError: (e: string | null) => void }) {
  const [busy, setBusy] = useState(false);

  const login = async () => {
    setBusy(true);
    onError(null);
    try {
      await signIn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          📝 응시현황표 제작
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          학교 Google 계정{ALLOWED_DOMAIN ? ` (@${ALLOWED_DOMAIN})` : ''}으로 로그인하세요.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
            {error}
          </Alert>
        )}
        <Button variant="contained" size="large" fullWidth onClick={login} disabled={busy}>
          Google로 로그인
        </Button>
      </Paper>
    </Box>
  );
}
