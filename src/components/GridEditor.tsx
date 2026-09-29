import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box } from '@mui/material';

export interface GridColumn {
  key: string;
  label: ReactNode;
  width: number;
  numeric?: boolean;
  sticky?: boolean; // 가로 스크롤해도 왼쪽에 고정
}

export interface CellChange {
  row: number; // 화면에 보이는 행 번호(0부터)
  col: number;
  text: string;
}

interface Props {
  columns: GridColumn[];
  rowCount: number;
  getText: (row: number, col: number) => string;
  getStyle?: (row: number, col: number) => { bg?: string; color?: string; title?: string } | undefined;
  onChange: (changes: CellChange[]) => void;
  rowAction?: (row: number) => ReactNode;
  height?: number | string;
  /** 이 칸을 선택하고 잠깐 강조 (데이터 검증에서 이동해 올 때). nonce가 바뀔 때마다 다시 */
  focus?: { row: number; col: number; nonce: string };
}

const ROW_H = 30;

/**
 * 엑셀처럼 쓰는 편집 표.
 * 방향키 이동, Enter/F2 편집, 바로 입력하면 덮어쓰기, Delete로 지우기, Tab 오른쪽,
 * 엑셀에서 복사한 범위 붙여넣기(Ctrl+V), 복사(Ctrl+C).
 */
export function GridEditor({ columns, rowCount, getText, getStyle, onChange, rowAction, height = '70vh', focus }: Props) {
  const [sel, setSel] = useState({ row: 0, col: 0 });
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // 편집 중인 값
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stickyLeft = columns.reduce<number[]>((acc, _c, i) => {
    acc.push(i === 0 ? (rowAction ? 36 : 0) : acc[i - 1] + (columns[i - 1].sticky ? columns[i - 1].width : 0));
    return acc;
  }, []);

  useEffect(() => {
    if (sel.row >= rowCount && rowCount > 0) setSel((s) => ({ ...s, row: rowCount - 1 }));
  }, [rowCount, sel.row]);

  // 데이터 검증에서 이동해 오면: 그 칸 선택 → 표를 화면에 보이게 → 칸을 가운데로 → 잠깐 노랗게
  useEffect(() => {
    if (!focus || focus.row < 0 || focus.row >= rowCount) return;
    setSel({ row: focus.row, col: focus.col });
    setEditing(null);
    const key = `${focus.row}:${focus.col}`;
    setFlash(key);
    const wrap = wrapRef.current;
    if (wrap) window.scrollTo({ top: wrap.getBoundingClientRect().top + window.scrollY - 170, behavior: 'smooth' });
    requestAnimationFrame(() => {
      wrap?.querySelector(`[data-cell="${key}"]`)?.scrollIntoView({ block: 'center', inline: 'center' });
      inputRef.current?.focus({ preventScroll: true });
    });
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [focus?.nonce, focus?.row, focus?.col]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택한 칸이 보이도록 스크롤
  useEffect(() => {
    wrapRef.current?.querySelector(`[data-cell="${sel.row}:${sel.col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel]);

  // 선택 칸의 입력창에 포커스 (단, 검색창 등 표 밖에서 입력 중이면 뺏지 않는다)
  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || wrapRef.current?.contains(active)) inputRef.current?.focus({ preventScroll: true });
  }, [sel.row, sel.col, editing === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (dr: number, dc: number) =>
    setSel((s) => ({
      row: Math.min(Math.max(s.row + dr, 0), Math.max(rowCount - 1, 0)),
      col: Math.min(Math.max(s.col + dc, 0), columns.length - 1),
    }));

  const commit = (dr: number, dc: number) => {
    if (editing !== null && editing !== getText(sel.row, sel.col)) {
      onChange([{ row: sel.row, col: sel.col, text: editing }]);
    }
    setEditing(null);
    move(dr, dc);
  };

  // 메모된 행이 항상 최신 상태로 클릭을 처리하도록 ref를 거친다
  const selectRef = useRef<(row: number, col: number, dbl: boolean) => void>(() => {});
  selectRef.current = (row, col, dbl) => {
    if (editing !== null) commit(0, 0);
    setSel({ row, col });
    if (dbl) setEditing(getText(row, col));
  };
  const select = useCallback((row: number, col: number, dbl: boolean) => selectRef.current(row, col, dbl), []);

  /**
   * 선택한 칸에는 항상 투명한 입력창이 있다. 이동 모드(editing === null)에서는 비어 있다가
   * 글자가 들어오면(한글 IME 조합 포함) 그대로 편집 모드가 된다 — 덮어쓰기 입력.
   */
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 조합 중
    const k = e.key;
    if (editing === null) {
      // 빈 입력창의 브라우저 기본 되돌리기는 막는다 (데이터 되돌리기는 페이지에서 처리)
      if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(k.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (k === 'ArrowUp') move(-1, 0);
      else if (k === 'ArrowDown') move(1, 0);
      else if (k === 'ArrowLeft') move(0, -1);
      else if (k === 'ArrowRight') move(0, 1);
      else if (k === 'Tab') move(0, e.shiftKey ? -1 : 1);
      else if (k === 'Enter') move(1, 0);
      else if (k === 'F2') setEditing(getText(sel.row, sel.col));
      else if (k === 'Delete' || k === 'Backspace') onChange([{ ...sel, text: '' }]);
      else return;
      e.preventDefault();
      return;
    }
    if (k === 'Enter') commit(1, 0);
    else if (k === 'Tab') commit(0, e.shiftKey ? -1 : 1);
    else if (k === 'Escape') setEditing(null);
    else return;
    e.preventDefault();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (editing !== null) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    const changes: CellChange[] = [];
    lines.forEach((line, dr) =>
      line.split('\t').forEach((cell, dc) => {
        const row = sel.row + dr;
        const col = sel.col + dc;
        if (row < rowCount && col < columns.length) changes.push({ row, col, text: cell });
      }),
    );
    if (changes.length) onChange(changes);
  };

  const onCopy = (e: React.ClipboardEvent) => {
    if (editing !== null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', getText(sel.row, sel.col));
  };

  return (
    <Box
      ref={wrapRef}
      tabIndex={0}
      onFocus={(e) => e.target === wrapRef.current && inputRef.current?.focus({ preventScroll: true })}
      onPaste={onPaste}
      onCopy={onCopy}
      sx={{
        height,
        overflow: 'auto',
        outline: 'none',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: '#fff',
        '&:focus-visible': { borderColor: 'primary.main' },
      }}
    >
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 13, tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {rowAction && <th style={{ ...headStyle, width: 36, left: 0, zIndex: 3 }} />}
            {columns.map((c, i) => (
              <th
                key={c.key}
                style={{
                  ...headStyle,
                  width: c.width,
                  minWidth: c.width,
                  ...(c.sticky ? { left: stickyLeft[i], zIndex: 3 } : {}),
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, r) => (
            <GridRow
              key={r}
              row={r}
              columns={columns}
              stickyLeft={stickyLeft}
              selCol={sel.row === r ? sel.col : -1}
              flashCol={flash && flash.startsWith(`${r}:`) ? Number(flash.split(':')[1]) : -1}
              editing={sel.row === r ? editing : null}
              getText={getText}
              getStyle={getStyle}
              rowAction={rowAction}
              onSelect={select}
              input={
                <input
                  ref={inputRef}
                  value={editing ?? ''}
                  onChange={(e) => (editing !== null || e.target.value !== '') && setEditing(e.target.value)}
                  onKeyDown={onInputKey}
                  onBlur={() => editing !== null && commit(0, 0)}
                  aria-label="칸 편집"
                  style={{ ...inputStyle, caretColor: editing === null ? 'transparent' : undefined }}
                />
              }
            />
          ))}
        </tbody>
      </table>
    </Box>
  );
}

interface RowProps {
  row: number;
  columns: GridColumn[];
  stickyLeft: number[];
  selCol: number;
  flashCol: number;
  editing: string | null;
  getText: Props['getText'];
  getStyle: Props['getStyle'];
  rowAction: Props['rowAction'];
  onSelect: (row: number, col: number, dbl: boolean) => void;
  input: ReactNode;
}

// 선택·편집 중이 아닌 행은 다시 그리지 않는다 (200명 × 20과목)
const GridRow = memo(
  function GridRow({ row, columns, stickyLeft, selCol, flashCol, editing, getText, getStyle, rowAction, onSelect, input }: RowProps) {
    return (
      <tr style={{ height: ROW_H }}>
        {rowAction && <td style={{ ...cellStyle, position: 'sticky', left: 0, zIndex: 1, background: '#fafafa', padding: 0 }}>{rowAction(row)}</td>}
        {columns.map((c, col) => {
          const selected = selCol === col;
          const st = getStyle?.(row, col);
          return (
            <td
              key={c.key}
              data-cell={`${row}:${col}`}
              title={st?.title}
              onMouseDown={(e) => {
                if (e.target instanceof HTMLInputElement && editing !== null) return; // 편집 중 커서 이동은 그대로
                e.preventDefault();
                onSelect(row, col, false);
              }}
              onDoubleClick={() => onSelect(row, col, true)}
              style={{
                ...cellStyle,
                textAlign: c.numeric ? 'right' : 'left',
                background: st?.bg ?? (c.sticky ? '#fafafa' : '#fff'),
                color: st?.color,
                ...(c.sticky ? { position: 'sticky', left: stickyLeft[col], zIndex: 1 } : {}),
                ...(selected ? { outline: '2px solid #2e7d32', outlineOffset: -2 } : {}),
                ...(flashCol === col ? { background: '#fff59d', outline: '3px solid #f9a825', outlineOffset: -3, transition: 'background .3s' } : {}),
              }}
            >
              {selected ? (
                <div style={{ position: 'relative', height: ROW_H - 1, display: 'flex', alignItems: 'center', justifyContent: c.numeric ? 'flex-end' : 'flex-start' }}>
                  {editing === null && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{getText(row, col)}</span>}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>{input}</div>
                </div>
              ) : (
                getText(row, col)
              )}
            </td>
          );
        })}
      </tr>
    );
  },
  (a, b) =>
    a.selCol === b.selCol &&
    a.flashCol === b.flashCol &&
    a.editing === b.editing &&
    a.getText === b.getText &&
    a.getStyle === b.getStyle &&
    a.columns === b.columns &&
    a.rowAction === b.rowAction &&
    a.stickyLeft.join() === b.stickyLeft.join(),
);

const headStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  background: '#f1f5f2',
  color: '#24503a',
  fontWeight: 600,
  fontSize: 12,
  padding: '6px 8px',
  borderBottom: '1px solid #c9d3cd',
  borderRight: '1px solid #e3e8e5',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const cellStyle: React.CSSProperties = {
  padding: '0 8px',
  borderBottom: '1px solid #eceff1',
  borderRight: '1px solid #eceff1',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  cursor: 'cell',
  userSelect: 'none',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: ROW_H - 4,
  border: 'none',
  outline: 'none',
  font: 'inherit',
  padding: 0,
  background: 'transparent',
};
