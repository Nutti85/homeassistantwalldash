import { useRef, useState, type ReactNode } from 'react';

type Size = { columns: number; height?: number };
const step = 24;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function ResizableCard({ id, label, children, minHeight = 96 }: { id: string; label: string; children: ReactNode; minHeight?: number }) {
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; width: number; height: number; size: Size }>();
  const [size, setSize] = useState<Size>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`walldash-v2-card-${id}`) ?? '{}') as Size;
      return { columns: Number.isInteger(saved.columns) ? clamp(saved.columns, 1, 4) : 4, height: Number.isFinite(saved.height) ? clamp(saved.height!, minHeight, 1400) : undefined };
    } catch { return { columns: 4 }; }
  });
  const latest = useRef(size);
  const update = (next: Size) => { latest.current = next; setSize(next); };
  const save = () => { try { window.localStorage.setItem(`walldash-v2-card-${id}`, JSON.stringify(latest.current)); } catch { /* Storage may be unavailable. */ } };
  const reset = () => { update({ columns: 4 }); try { window.localStorage.removeItem(`walldash-v2-card-${id}`); } catch { /* Storage may be unavailable. */ } };

  const minimumColumns = () => clamp(Math.ceil(160 / ((card.current?.parentElement?.clientWidth ?? 640) / 4)), 1, 4);
  return <div ref={card} className={`ppf-resizable${size.height === undefined ? '' : ' has-custom-height'}`} data-card-id={id} style={{ width: `${size.columns * 25}%`, height: size.height }}>
    {children}
    <button type="button" className="ppf-card-resize-handle" aria-label={`Endre størrelse på ${label}`} title={`Dra for å endre ${label} · piltaster justerer · Home tilbakestiller`} onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: card.current?.parentElement?.clientWidth ?? 1, height: card.current?.getBoundingClientRect().height ?? minHeight, size: latest.current };
    }} onPointerMove={(event) => {
      const start = drag.current;
      if (!start || event.pointerId !== start.pointerId) return;
      const columns = window.innerWidth <= 700 ? start.size.columns : clamp(start.size.columns - Math.round((event.clientX - start.x) / (start.width / 4)), minimumColumns(), 4);
      const deltaY = event.clientY - start.y;
      const height = Math.abs(deltaY) < 6 && start.size.height === undefined ? undefined : clamp(Math.round((start.height + deltaY) / step) * step, minHeight, 1400);
      update({ columns, height });
    }} onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) { drag.current = undefined; save(); } }} onPointerCancel={(event) => { if (drag.current?.pointerId === event.pointerId) { update(drag.current.size); drag.current = undefined; } }} onKeyDown={(event) => {
      if (event.key === 'Home') { event.preventDefault(); reset(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = { ...latest.current };
      if (event.key === 'ArrowLeft' && window.innerWidth > 700) next.columns = clamp(next.columns + 1, minimumColumns(), 4);
      if (event.key === 'ArrowRight' && window.innerWidth > 700) next.columns = clamp(next.columns - 1, minimumColumns(), 4);
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') next.height = clamp(Math.round(((next.height ?? card.current?.getBoundingClientRect().height ?? minHeight) + (event.key === 'ArrowDown' ? step : -step)) / step) * step, minHeight, 1400);
      update(next); save();
    }} onDoubleClick={reset}><span className="material-symbols-outlined" aria-hidden="true">open_in_full</span></button>
  </div>;
}
