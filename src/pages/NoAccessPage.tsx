import { Box, Button, Paper, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { signOut, type DeniedUser } from '../firebase/auth';

/** 학교 계정이지만 담당교사로 지정되지 않은 경우 */
export function NoAccessPage({ denied }: { denied: DeniedUser }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <LockOutlinedIcon sx={{ fontSize: 44, color: 'text.secondary' }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
          사용 권한이 없습니다
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          <b>{denied.email}</b> 계정은 응시현황표 담당교사로 지정되어 있지 않습니다.
          <br />
          관리자에게 담당교사 지정을 요청한 뒤 다시 로그인하세요.
        </Typography>
        <Button variant="outlined" onClick={() => signOut()}>
          다른 계정으로 로그인
        </Button>
      </Paper>
    </Box>
  );
}
