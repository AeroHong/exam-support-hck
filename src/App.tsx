import { AppBar, Box, Button, CircularProgress, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { firebaseConfigured } from './firebase/app';
import { signOut, useAuth, type AppUser } from './firebase/auth';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { WorkPage } from './pages/WorkPage';
import { VacancyPage } from './pages/VacancyPage';

/** Firebase 미설정(로컬 모드)일 때 쓰는 가상 사용자 */
const LOCAL_USER: AppUser = { uid: 'local', email: '', name: '로컬 모드', role: 'admin' };

export function App() {
  const { user, loading, error, setError } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (firebaseConfigured && !user) return <LoginPage error={error} onError={setError} />;

  const me = user ?? LOCAL_USER;
  const nav = [
    { to: '/', label: '시험 자료' },
    { to: '/work', label: '응시현황표' },
    { to: '/vacancies', label: '결번 관리' },
  ];

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#fff', color: 'text.primary', borderBottom: '1px solid #e0e0e0' }}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 2 }}>
            📝 응시현황표 제작
          </Typography>
          {nav.map((n) => (
            <Button
              key={n.to}
              component={RouterLink}
              to={n.to}
              color={location.pathname === n.to ? 'primary' : 'inherit'}
              sx={{ fontWeight: location.pathname === n.to ? 700 : 400 }}
            >
              {n.label}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {me.name}
            {me.role === 'admin' && firebaseConfigured ? ' (관리자)' : ''}
          </Typography>
          {firebaseConfigured && (
            <Button size="small" onClick={() => signOut()}>
              로그아웃
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
        <Routes>
          <Route path="/" element={<HomePage user={me} />} />
          <Route path="/work" element={<WorkPage user={me} />} />
          <Route path="/vacancies" element={<VacancyPage user={me} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}
