import { useEffect, useRef, useState } from "react";
import { Button, OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { ChartPoint, Download, Erase, Home, Move, ZoomIn, ZoomOut } from "@carbon/icons-react";
import type { AxesMode, Pin, View } from "../lib/axes";

/** Track a container's pixel width so charts render at true size and chart
 *  text stays on the type scale (no viewBox scaling of 12 px labels). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Per-chart view state: interaction mode, zoomed/panned limits, pinned tips.
 *  `resetKey` (e.g. a new solver result) clears zoom and pins. */
export function useAxesState(resetKey: unknown) {
  const [mode, setMode] = useState<AxesMode>("datatip");
  const [view, setView] = useState<View | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const key = useRef(resetKey);
  if (key.current !== resetKey) { key.current = resetKey; if (view) setView(null); if (pins.length) setPins([]); }
  // Esc clears pinned data tips
  useEffect(() => {
    if (!pins.length) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPins([]); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pins.length]);
  return { mode, setMode, view, setView, pins, setPins };
}

const MODES: { mode: AxesMode; label: string; Icon: typeof Move }[] = [
  { mode: "datatip", label: "Data tips: hover to read, click to pin", Icon: ChartPoint },
  { mode: "pan", label: "Pan: drag to move, scroll to zoom", Icon: Move },
  { mode: "zoomin", label: "Zoom in: drag a box or click", Icon: ZoomIn },
  { mode: "zoomout", label: "Zoom out: click", Icon: ZoomOut },
];

/** Axes toolbar, MATLAB layout: interaction modes, restore view, export. */
export function AxesToolbar({ active, mode, setMode, onRestore, canRestore, onPng, onSvg, onCsv, pinCount = 0, onClearPins }: {
  active?: boolean; pinCount?: number; onClearPins?: () => void; mode: AxesMode; setMode: (m: AxesMode) => void; onRestore: () => void; canRestore: boolean;
  onPng: () => void; onSvg: () => void; onCsv: () => void;
}) {
  return (
    <div className={`axes-toolbar${active ? " is-active" : ""}`} role="toolbar" aria-label="Chart tools">
      {MODES.map(({ mode: m, label, Icon }) => (
        <Button key={m} kind="ghost" size="sm" hasIconOnly renderIcon={Icon} iconDescription={label}
          tooltipPosition="bottom" isSelected={mode === m} aria-pressed={mode === m} onClick={() => setMode(m)} />
      ))}
      <span className="axes-toolbar__sep" aria-hidden="true" />
      {pinCount > 0 && onClearPins && (
        <Button kind="ghost" size="sm" hasIconOnly renderIcon={Erase} iconDescription={`Clear ${pinCount} data tip${pinCount > 1 ? "s" : ""} (Esc)`}
          tooltipPosition="bottom" onClick={onClearPins} />
      )}
      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Home} iconDescription="Restore view"
        tooltipPosition="bottom" disabled={!canRestore} onClick={onRestore} />
      <OverflowMenu renderIcon={Download} size="sm" flipped iconDescription="Export" aria-label="Export">
        <OverflowMenuItem itemText="Image (PNG)" onClick={onPng} />
        <OverflowMenuItem itemText="Vector figure (SVG)" onClick={onSvg} />
        <OverflowMenuItem itemText="Data (CSV)" onClick={onCsv} />
      </OverflowMenu>
    </div>
  );
}

/** rows: [label, value, series colour?]. Values lead; a short stroke keys the series. */
export interface Tip { left: number; top: number; flip: boolean; title: string; rows: [string, string, string?][] }

/** Hover data tip, snapped to a computed point. */
export function DataTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className={`chart-tip${tip.flip ? " chart-tip--flip" : ""}`} style={{ left: tip.left, top: tip.top }} aria-hidden="true">
      <div className="chart-tip__head">{tip.title}</div>
      {tip.rows.map(([k, v, c]) => (
        <div key={k} className="chart-tip__row">
          <span className="chart-tip__val">{v}</span>
          <span className="chart-tip__key">
            {c && <svg width="12" height="8" aria-hidden="true"><line x1="0" y1="4" x2="12" y2="4" stroke={c} strokeWidth="2" /></svg>}
            {k}
          </span>
        </div>
      ))}
    </div>
  );
}
