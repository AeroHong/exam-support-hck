import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getGoogleAccessToken } from '../firebase/auth';
import { pickDriveFolder, pickerAvailable, type DriveFolder } from '../export/drivePicker';
import type { GSheetsTarget } from '../export/gsheets';

const LAST_FOLDER_KEY = 'gsheets:lastFolder';

function readLastFolder(): DriveFolder | null {
  try {
    const v = localStorage.getItem(LAST_FOLDER_KEY);
    return v ? (JSON.parse(v) as DriveFolder) : null;
  } catch {
    return null;
  }
}

function saveLastFolder(f: DriveFolder | null) {
  try {
    if (f) localStorage.setItem(LAST_FOLDER_KEY, JSON.stringify(f));
    else localStorage.removeItem(LAST_FOLDER_KEY);
  } catch {
    /* 저장 못 해도 동작에는 문제없음 */
  }
}

interface Props {
  open: boolean;
  defaultSubfolder: string;
  count: { subjects: number; sheets: number };
  onClose: () => void;
  onConfirm: (target: GSheetsTarget) => void;
}

/** Google 시트 내보내기 전에 저장 위치(내 드라이브·공유 드라이브 폴더)를 고른다 */
export function GSheetsDialog({ open, defaultSubfolder, count, onClose, onConfirm }: Props) {
  const [folder, setFolder] = useState<DriveFolder | null>(readLastFolder);
  const [useSubfolder, setUseSubfolder] = useState(true);
  const [subfolder, setSubfolder] = useState(defaultSubfolder);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const choose = async () => {
    setError(null);
    setPicking(true);
    try {
      const token = await getGoogleAccessToken();
      const picked = await pickDriveFolder(token);
      if (picked) {
        setFolder(picked);
        saveLastFolder(picked);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPicking(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Google 스프레드시트로 내보내기</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {count.subjects}과목 · {count.sheets}장. 과목마다 스프레드시트 1개가 만들어지고, 고사실별로 시트가 나뉩니다.
          </Typography>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField
              label="저장 폴더"
              size="small"
              value={folder ? folder.name : '내 드라이브'}
              slotProps={{ input: { readOnly: true } }}
              sx={{ flex: 1 }}
            />
            {pickerAvailable && (
              <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={choose} disabled={picking}>
                폴더 선택
              </Button>
            )}
            {folder && (
              <Button
                onClick={() => {
                  setFolder(null);
                  saveLastFolder(null);
                }}
              >
                초기화
              </Button>
            )}
          </Stack>
          {!pickerAvailable && (
            <Alert severity="info">폴더 선택을 쓰려면 VITE_GOOGLE_PICKER_API_KEY를 설정해야 합니다. 지금은 내 드라이브에 저장됩니다.</Alert>
          )}

          <FormControlLabel
            control={<Checkbox checked={useSubfolder} onChange={(e) => setUseSubfolder(e.target.checked)} />}
            label="선택한 폴더 안에 새 폴더를 만들어 저장"
          />
          {useSubfolder && (
            <TextField label="새 폴더 이름" size="small" value={subfolder} onChange={(e) => setSubfolder(e.target.value)} />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          disabled={useSubfolder && !subfolder.trim()}
          onClick={() => onConfirm({ parentId: folder?.id ?? null, subfolderName: useSubfolder ? subfolder.trim() : null })}
        >
          내보내기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
