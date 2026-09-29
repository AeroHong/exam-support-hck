import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { App } from './App';

const theme = createTheme({
  palette: { primary: { main: '#2e7d32' }, background: { default: '#f5f6f8' } },
  typography: { fontFamily: "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
  shape: { borderRadius: 8 },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
