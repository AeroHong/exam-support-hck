import { createPortal } from 'react-dom';
import type { RoomSheet, SubjectRoster } from '../../core';
import { RoomSheetView } from './RoomSheetView';
import { SpareSheetView } from './SpareSheetView';

/** 출력할 한 장: 고사실 현황표 또는 과목별 '여분' 표지 */
export type PrintItem = { kind: 'room'; key: string; sheet: RoomSheet } | { kind: 'spare'; key: string; roster: SubjectRoster };

/** 과목별로 고사실 현황표를 차례로, 과목 끝에 '여분' 표지(선택) */
export function printItemsOf(rosters: SubjectRoster[], withSpare: boolean): PrintItem[] {
  return rosters.flatMap((r) => [
    ...r.sheets.map((s): PrintItem => ({ kind: 'room', key: s.key, sheet: s })),
    ...(withSpare ? [{ kind: 'spare', key: `${r.subjectKey}|여분`, roster: r } as PrintItem] : []),
  ]);
}

export function PrintItemView({ item }: { item: PrintItem }) {
  return item.kind === 'room' ? <RoomSheetView sheet={item.sheet} /> : <SpareSheetView roster={item.roster} />;
}

/** 인쇄 전용 영역. 화면에서는 숨겨지고, 인쇄 시 이것만 출력된다. */
export function PrintRoot({ items }: { items: PrintItem[] }) {
  let el = document.getElementById('print-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-root';
    document.body.appendChild(el);
  }
  return createPortal(
    <>
      {items.map((it) => (
        <PrintItemView key={it.key} item={it} />
      ))}
    </>,
    el,
  );
}
