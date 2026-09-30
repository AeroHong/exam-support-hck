import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { PrintItemView, printItemLabel, type PrintItem } from '../export/print/PrintRoot';

const SCALE = 0.6;
const A4_W = 794; // 210mm @96dpi
const A4_H = 1123; // 297mm @96dpi

/** A4 현황표·여분 표지를 축소해서 보여준다 (인쇄 결과와 같은 컴포넌트) */
export function SheetPreview({ item, onPrint }: { item: PrintItem | null; onPrint?: (item: PrintItem) => void }) {
  const label = item ? printItemLabel(item) : '';
  return (
    <Paper variant="outlined" sx={{ p: 2, flexShrink: 0, bgcolor: '#eceff1', position: { lg: 'sticky' }, top: { lg: 64 } }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', width: A4_W * SCALE }}>
        <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
          미리보기 {label && `— ${label}`}
        </Typography>
        {item && onPrint && (
          <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={() => onPrint(item)} sx={{ flexShrink: 0, bgcolor: '#fff' }}>
            이 장만 인쇄
          </Button>
        )}
      </Stack>
      {item ? (
        <Box sx={{ width: A4_W * SCALE, maxHeight: '80vh', overflowY: 'auto', overflowX: 'hidden' }}>
          <Box sx={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width: A4_W, mb: `${-A4_H * (1 - SCALE)}px` }}>
            <PrintItemView item={item} />
          </Box>
        </Box>
      ) : (
        <Box sx={{ width: A4_W * SCALE, height: 200, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
          고사실을 선택하세요
        </Box>
      )}
    </Paper>
  );
}
