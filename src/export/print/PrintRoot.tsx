import { createPortal } from 'react-dom';
import type { RoomSheet } from '../../core';
import { RoomSheetView } from './RoomSheetView';

/** 인쇄 전용 영역. 화면에서는 숨겨지고, 인쇄 시 이것만 출력된다. */
export function PrintRoot({ sheets }: { sheets: RoomSheet[] }) {
  let el = document.getElementById('print-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-root';
    document.body.appendChild(el);
  }
  return createPortal(
    <>
      {sheets.map((s) => (
        <RoomSheetView key={s.key} sheet={s} />
      ))}
    </>,
    el,
  );
}
