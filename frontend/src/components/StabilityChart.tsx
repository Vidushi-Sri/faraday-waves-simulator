import { useEffect, useId, useRef, useState } from "react";
import * as d3 from "d3";
import type { AllowedMode, CriticalResponse, Curve, CurvePoint } from "../api/types";
import { fmt, modeLabel, responseWord, sig4 } from "../lib/text";
import { csv, downloadSvg, downloadText, drawFrame, FONT, layoutLegend, measure, type LegendEntry } from "../lib/plot";
import { bindAxes, downloadPng, drawPins, type Pin } from "../lib/axes";
import { AxesToolbar, DataTip, useAxesState, useWidth, type Tip } from "./ChartTools";
import { RESPONSE_COLOR, STATUS_FILL } from "../lib/colors";

/**
 * Stability chart in the (k, a) plane, the convention of the solver's own
 * faraday_floquet.plot_tongues: k from 0.15 k_c to 3 k_c, a up to 6 a_c,
 * subharmonic family solid, harmonic family dashed, allowed container modes
 * as dots. Each curve is the solver's threshold(k) for that response type,
 * i.e. the lower edge of all its tongues; the region above is unstable.
 *
 * Applied acceleration is a horizontal line (forcing acts on every k).
 * Infinite layer: the computed points under that line are the growing band.
 * Finite container: only allowed modes exist; those under the line are filled.
 * Nothing is interpolated or recomputed here. Zoom/pan only change the view.
 */
const H = 380;
type SG = d3.Selection<SVGGElement, unknown, null, undefined>;

/** Contiguous runs of computed points with a <= applied (selection only). */
function runsBelow(points: CurvePoint[], a: number) {
  const runs: [number, number][] = [];
  let start: number | null = null;
  points.forEach((p, i) => {
    const inside = p.a_m_s2 != null && p.a_m_s2 <= a;
    if (inside && start === null) start = i;
    if (!inside && start !== null) { runs.push([points[start].wavenumber_per_mm, points[i - 1].wavenumber_per_mm]); start = null; }
  });
  if (start !== null) runs.push([points[start].wavenumber_per_mm, points[points.length - 1].wavenumber_per_mm]);
  return runs;
}

export function StabilityChart({
  r, appliedA, pending, draggable, onAppliedChange,
}: {
  r: CriticalResponse;
  appliedA: number;
  pending: boolean;
  draggable: boolean;
  onAppliedChange: (a: number) => void;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const ref = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const ax = useAxesState(r);
  const keepFocus = useRef(false);   // keep keyboard focus on the handle across redraws
  const clipId = `stab-clip-${useId().replace(/:/g, "")}`;
  const plots = r.plots!;
  const finite = r.model.geometry !== "infinite";
  const hot = pending ? STATUS_FILL.pending : STATUS_FILL[r.results.status];
  const { mode, view, pins, setView, setPins } = ax;

  useEffect(() => {
    const svgEl = ref.current;
    if (!svgEl || width < 240) return;
    const W = width;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.on(".", null);

    const range = plots.plot_range;
    const aTop = Math.max(range.a_max_m_s2, appliedA * 1.08);
    const x = d3.scaleLinear(view?.x ?? [range.wavenumber_min_per_mm, range.wavenumber_max_per_mm], [0, 1]);
    const y = d3.scaleLinear(view?.y ?? [0, aTop], [0, 1]);
    const xTicks = x.ticks(Math.max(2, Math.min(7, Math.floor(W / 100)))), yTicks = y.ticks(6);
    const xFmt = d3.format("~g"), yFmt = d3.format(",~r");
    const crit = r.results.critical_mode;
    const acTag = r.results.critical_acceleration_m_s2;

    const g = svg.append("g");
    // left margin fits the widest tick label AND the bold a_c tag (measured at weight 600)
    const tagW = (() => {
      const t = g.append("text").attr("font-size", 12).attr("font-weight", 600).attr("font-family", FONT).text(fmt(acTag));
      const w = (t.node() as SVGTextElement).getBBox().width; t.remove(); return Math.ceil(w);
    })();
    const M = { t: 12, r: 16, b: 46, l: Math.max(measure(g, yTicks.map(yFmt)), tagW) + 10 + 28 };
    const [L, R, T, B] = [M.l, W - M.r, M.t, H - M.b];
    const box = { L, R, T, B };
    x.range([L, R]); y.range([B, T]);

    // legend (part of the figure, so exports carry it)
    const families = (c: Curve) => c.minima
      .filter(m => m.a_m_s2 <= y.domain()[1] && m.wavenumber_per_mm >= x.domain()[0] && m.wavenumber_per_mm <= x.domain()[1])
      .map(m => m.response_frequency).join(", ");
    const sub = plots.tongues.find(c => c.response === "subharmonic");
    const har = plots.tongues.find(c => c.response === "harmonic");
    const lineSw = (color: string, dash?: string, w = 2) => (sg: SG) => {
      sg.append("line").attr("x1", 0).attr("x2", 22).attr("stroke", color).attr("stroke-width", w).attr("stroke-dasharray", dash ?? null);
    };
    const dotSw = (fill: string, stroke: string) => (sg: SG) => {
      sg.append("circle").attr("cx", 11).attr("r", 3.5).attr("fill", fill).attr("stroke", stroke).attr("stroke-width", 1.5);
    };
    const bands = finite ? [] : plots.tongues.flatMap(c => runsBelow(c.points, appliedA));
    const anyUnstableMode = plots.allowed_modes.some(m => m.critical_acceleration_m_s2 < appliedA);
    const entries: LegendEntry[] = [
      ...(sub ? [{ label: `Subharmonic${families(sub) ? ` (${families(sub)})` : ""}`, swatch: lineSw(RESPONSE_COLOR.subharmonic) }] : []),
      ...(har ? [{ label: `Harmonic${families(har) ? ` (${families(har)})` : ""}`, swatch: lineSw(RESPONSE_COLOR.harmonic, "6 4", 1.5) }] : []),
      { label: "Applied acceleration", swatch: lineSw("#161616", "5 3", 1) },
      ...(crit ? [{ label: finite ? "Critical mode" : "Onset threshold", swatch: (sg: SG) => { sg.append("circle").attr("cx", 11).attr("r", 5).attr("fill", "#fff").attr("stroke", "#161616").attr("stroke-width", 1.5); } }] : []),
      ...(finite ? [{ label: "Allowed mode", swatch: dotSw("#fff", "#6f6f6f") }] : []),
      ...(finite && anyUnstableMode ? [{ label: "Unstable mode", swatch: dotSw(hot, hot) }] : []),
      ...(!finite && bands.length ? [{ label: "Growing wavenumbers", swatch: (sg: SG) => { sg.append("line").attr("x1", 2).attr("x2", 20).attr("stroke", hot).attr("stroke-width", 2); [2, 20].forEach(cx => sg.append("circle").attr("cx", cx).attr("r", 2.5).attr("fill", "#fff").attr("stroke", hot).attr("stroke-width", 1.5)); } }] : []),
    ];
    const legend = layoutLegend(g, entries, 16, W - 16);
    const HT = H + 10 + legend.height + 1;
    svg.attr("width", W).attr("height", HT).attr("viewBox", `0 0 ${W} ${HT}`).attr("font-family", FONT).style("background", "#fff");

    const frame = drawFrame(g, x, y, {
      xTicks, yTicks, xFmt, yFmt, M, W, H, xTitle: "Wavenumber k (mm⁻¹)", yTitle: "Forcing acceleration a (m/s²)",
    });
    svg.append("defs").append("clipPath").attr("id", clipId)
      .append("rect").attr("x", L).attr("y", T).attr("width", R - L).attr("height", B - T);
    const clip = g.append("g").attr("clip-path", `url(#${clipId})`);
    const plot = clip.append("g");                       // everything that pans

    const defined = (p: CurvePoint) => p.a_m_s2 != null;
    // The solver's envelope can jump from one tongue to the next between two
    // samples. Drawing a connector there would invent a boundary, so the
    // curve is split into continuous runs (display only; no values change).
    const jump = 0.15 * aTop;
    const runs = (pts: CurvePoint[]) => {
      const out: CurvePoint[][] = [];
      let cur: CurvePoint[] = [];
      pts.forEach((p, i) => {
        const prev = pts[i - 1];
        if (p.a_m_s2 == null) { if (cur.length) out.push(cur); cur = []; return; }
        if (prev?.a_m_s2 != null && Math.abs(p.a_m_s2 - prev.a_m_s2) > jump && cur.length) { out.push(cur); cur = []; }
        cur.push(p);
      });
      if (cur.length) out.push(cur);
      return out;
    };
    const line = d3.line<CurvePoint>().defined(defined).x(p => x(p.wavenumber_per_mm)).y(p => y(p.a_m_s2!));
    plots.tongues.forEach(c => runs(c.points).forEach(run => plot.append("path").datum(run).attr("d", line).attr("fill", "none")
      .attr("stroke", RESPONSE_COLOR[c.response]).attr("stroke-width", c.response === "subharmonic" ? 2 : 1.5)
      .attr("stroke-dasharray", c.response === "harmonic" ? "6 4" : null)));

    const halo = <S extends d3.Selection<SVGTextElement, unknown, null, undefined>>(s: S) =>
      s.attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4).attr("stroke-linejoin", "round");
    const label = (parent: SG, px: number, py: number, anchor: string, fill: string, weight = 400) =>
      halo(parent.append("text").attr("x", px).attr("y", py).attr("text-anchor", anchor)
        .attr("font-size", 12).attr("font-weight", weight).attr("fill", fill));

    const ay = y(appliedA);
    const aVisible = ay >= T && ay <= B;
    plots.tongues.forEach(c => c.minima.forEach(m => {
      const mx = x(m.wavenumber_per_mm), my = y(m.a_m_s2);
      const clash = Math.abs(ay - (my + 14)) < 12;
      const [px, py, anchor] = clash ? [mx + 10, my - 4, "start"] : [mx, my + 18, "middle"];
      label(plot, px, py, anchor, "#393939", 600).text(m.response_frequency);   // text wears ink, the curve carries the colour
    }));

    plot.append("line").attr("class", "applied-line").attr("x1", L - 4000).attr("x2", R + 4000).attr("y1", ay).attr("y2", ay)
      .attr("stroke", "#161616").attr("stroke-dasharray", "5 3");
    // Unstable interval of the applied line: the same line, solid and in the
    // status colour between the two crossings, with open markers at the
    // crossings (standard highlighted-interval convention; no overlay bar).
    bands.forEach(([k0, k1]) => {
      const gb = plot.append("g").attr("class", "growing-band");
      gb.append("line").attr("x1", x(k0)).attr("x2", x(k1)).attr("y1", ay).attr("y2", ay).attr("stroke", "#fff").attr("stroke-width", 4);
      gb.append("line").attr("x1", x(k0)).attr("x2", x(k1)).attr("y1", ay).attr("y2", ay).attr("stroke", hot).attr("stroke-width", 2);
      [k0, k1].forEach(k => gb.append("circle").attr("cx", x(k)).attr("cy", ay).attr("r", 3)
        .attr("fill", "#fff").attr("stroke", hot).attr("stroke-width", 1.5));
    });
    plots.allowed_modes.forEach((m: AllowedMode) => {
      const un = m.critical_acceleration_m_s2 < appliedA;
      plot.append("circle").attr("cx", x(m.wavenumber_per_mm)).attr("cy", y(m.critical_acceleration_m_s2)).attr("r", 3.5)
        .attr("fill", un ? hot : "#fff").attr("stroke", un ? hot : RESPONSE_COLOR[m.response]).attr("stroke-width", 1.5);
    });
    if (crit && acTag != null) {
      const ox = x(crit.wavenumber_per_mm), oy = y(acTag);
      plot.append("line").attr("x1", L - 4000).attr("x2", ox - 6).attr("y1", oy).attr("y2", oy).attr("stroke", "#393939").attr("stroke-dasharray", "1 2");
      plot.append("circle").attr("cx", ox).attr("cy", oy).attr("r", 5).attr("fill", "none").attr("stroke", "#161616").attr("stroke-width", 1.5);
    }
    // Where the solver's curve jumps upward between neighbouring samples, the
    // tongue's lower and upper boundaries have met and the boundary folds back.
    // The solver returns only the lower branch, so say so at that point.
    if (!view) plots.tongues.forEach(c => c.points.forEach((p, i) => {
      const q = c.points[i + 1];
      if (p.a_m_s2 == null || !q || (q.a_m_s2 != null && q.a_m_s2 - p.a_m_s2 <= jump)) return;
      const px = x(p.wavenumber_per_mm), py = y(p.a_m_s2);
      if (px < L || px > R - 60 || py < T + 30 || py > B) return;
      plot.append("circle").attr("cx", px).attr("cy", py).attr("r", 2.5).attr("fill", RESPONSE_COLOR[c.response]);
      label(plot, px + 8, py + 4, "start", "#525252").text("boundary folds back");
      label(plot, px + 8, py + 18, "start", "#8d8d8d").text("(upper branch not computed)");
    }));
    // region note only in the default view: once zoomed, the corner may lie inside a tongue
    // keep the label clear of the applied line when that line runs near the bottom
    const stableY = Math.abs(ay - (B - 12)) < 16 ? Math.max(T + 14, ay - 10) : B - 8;
    if (!view) label(plot, L + 8, stableY, "start", "#525252").text("Stable region");
    // The solver gives each tongue's lower boundary only, so no region is
    // shaded (that would invent an upper boundary). The unstable side is
    // labelled just above the onset minimum, where it is certain.
    if (!view && crit && acTag != null)
      label(plot, x(crit.wavenumber_per_mm), y(acTag + 0.15 * (y.domain()[1] - y.domain()[0])), "middle", "#525252").text("Unstable");

    frame.finish();

    // a_c tagged on the y axis (bold), like a reference tick
    if (crit && acTag != null && y(acTag) >= T && y(acTag) <= B) {
      const oy = y(acTag);
      g.append("line").attr("x1", L - 4).attr("x2", L).attr("y1", oy).attr("y2", oy).attr("stroke", "#161616").attr("stroke-width", 2);
      g.selectAll<SVGTextElement, unknown>("text.tick-label[data-y]")
        .filter(function () { return Math.abs(Number(this.getAttribute("data-y")) - oy) < 14; }).remove();
      g.append("text").attr("x", L - 8).attr("y", oy + 4).attr("text-anchor", "end").attr("font-size", 12)
        .attr("font-weight", 600).attr("fill", "#161616").style("font-variant-numeric", "tabular-nums").text(fmt(acTag));
    }
    if (aVisible) {
      label(g, R - 12, ay - 12 < T + 12 ? ay + 18 : ay - 8, "end", "#161616", 600).attr("class", "applied-label").text(`a = ${fmt(appliedA)} m/s²`);
      if (draggable && mode === "datatip") {
        g.append("circle").attr("class", "applied-focus").attr("cx", R).attr("cy", ay).attr("r", 9).attr("fill", "none")
          .attr("stroke", "#0f62fe").attr("stroke-width", 2).attr("visibility", "hidden");
        g.append("circle").attr("class", "applied-handle").attr("cx", R).attr("cy", ay).attr("r", 5).attr("fill", "#fff").attr("stroke", "#161616").attr("stroke-width", 1.5);
      }
    }
    legend.draw(H + 10);

    // computed points for data tips
    type Pt = { px: number; py: number; pin: Pin };
    const pts: Pt[] = [
      ...plots.tongues.flatMap(c => c.points.filter(defined).map(p => ({
        px: x(p.wavenumber_per_mm), py: y(p.a_m_s2!),
        pin: { x: p.wavenumber_per_mm, y: p.a_m_s2!, title: `${responseWord(c.response)} boundary`,
          rows: [["k", `${sig4(p.wavenumber_per_mm)} mm⁻¹`], ["λ", `${sig4(p.wavelength_mm)} mm`], ["a", `${sig4(p.a_m_s2)} m/s²`]] as [string, string][] },
      }))),
      ...plots.allowed_modes.map(m => ({
        px: x(m.wavenumber_per_mm), py: y(m.critical_acceleration_m_s2),
        pin: { x: m.wavenumber_per_mm, y: m.critical_acceleration_m_s2, title: `Mode ${modeLabel(m.label)}`,
          rows: [["k", `${sig4(m.wavenumber_per_mm)} mm⁻¹`], ["a_c", `${sig4(m.critical_acceleration_m_s2)} m/s²`], ["type", responseWord(m.response)]] as [string, string][] },
      })),
    ].filter(q => q.py >= T && q.py <= B && q.px >= L && q.px <= R);
    const nearest = (ev: MouseEvent) => {
      const [mx, my] = d3.pointer(ev, svgEl);
      if (mx < L || mx > R || my < T || my > B) return null;
      const q = d3.least(pts, p => (p.px - mx) ** 2 + (p.py - my) ** 2);
      return q && Math.hypot(q.px - mx, q.py - my) <= 24 ? q : null;
    };

    drawPins(g, pins, x, y, box, i => setPins(ps => ps.filter((_, j) => j !== i)));

    if (mode === "datatip") {
      const cursor = g.append("rect").attr("width", 8).attr("height", 8).attr("fill", "none")
        .attr("stroke", "#161616").attr("stroke-width", 1.5).attr("visibility", "hidden").attr("pointer-events", "none");
      // Crosshair finds the k: a hairline snaps to the nearest computed k and
      // one tooltip lists every series there, so the reader aims at a
      // wavenumber, never at a 2px line. A container mode under the pointer wins.
      const hair = g.append("line").attr("y1", T).attr("y2", B).attr("stroke", "#8d8d8d")
        .attr("visibility", "hidden").attr("pointer-events", "none");
      const dots = plots.tongues.map(c => g.append("circle").attr("r", 3.5).attr("fill", "#fff")
        .attr("stroke", RESPONSE_COLOR[c.response]).attr("stroke-width", 2).attr("visibility", "hidden").attr("pointer-events", "none"));
      const hide = () => {
        cursor.attr("visibility", "hidden"); hair.attr("visibility", "hidden");
        dots.forEach(d => d.attr("visibility", "hidden")); setTip(null);
      };
      let dragging = false;
      svg.on("pointermove", (ev: PointerEvent) => {
        if (dragging) return;
        if ((ev.target as Element | null)?.closest?.(".pin")) { hide(); return; }          // over a pinned tip: keep it readable
        const [mx, my] = d3.pointer(ev, svgEl);
        if (mx < L || mx > R || my < T || my > B) { hide(); return; }
        const q = nearest(ev);
        if (q && q.pin.title.startsWith("Mode")) {
          hair.attr("visibility", "hidden"); dots.forEach(d => d.attr("visibility", "hidden"));
          cursor.attr("x", q.px - 4).attr("y", q.py - 4).attr("visibility", "visible");
          setTip({ left: q.px, top: q.py - 10, flip: q.px > W * 0.62, title: q.pin.title, rows: q.pin.rows });
          return;
        }
        cursor.attr("visibility", "hidden");
        const kq = x.invert(mx);
        const rows: [string, string, string?][] = [];
        let px = mx, lam: number | null = null, kk = kq;
        plots.tongues.forEach((c, j) => {
          const i = d3.minIndex(c.points, p => Math.abs(p.wavenumber_per_mm - kq));
          const p = c.points[i];
          px = x(p.wavenumber_per_mm); kk = p.wavenumber_per_mm; lam = p.wavelength_mm;
          if (p.a_m_s2 != null && y(p.a_m_s2) >= T && y(p.a_m_s2) <= B) {
            dots[j].attr("cx", px).attr("cy", y(p.a_m_s2)).attr("visibility", "visible");
            rows.push([responseWord(c.response), `${sig4(p.a_m_s2)} m/s²`, RESPONSE_COLOR[c.response]]);
          } else {
            dots[j].attr("visibility", "hidden");
            rows.push([responseWord(c.response), p.a_m_s2 == null ? "no threshold" : `${sig4(p.a_m_s2)} m/s² (above plot)`, RESPONSE_COLOR[c.response]]);
          }
        });
        hair.attr("x1", px).attr("x2", px).attr("visibility", "visible");
        setTip({ left: px, top: my - 10, flip: px > W * 0.62,
          title: `k ${sig4(kk)} mm⁻¹, λ ${sig4(lam)} mm`, rows });
      });
      svg.on("pointerleave", hide);
      svg.on("click", (ev: MouseEvent) => {
        if ((ev.target as Element | null)?.closest?.(".pin")) return;                        // the pin's own handler removes it
        const q = nearest(ev);
        // clicking a point toggles its tip, as in MATLAB
        if (q) setPins(ps => ps.some(p => p.x === q.pin.x && p.y === q.pin.y)
          ? ps.filter(p => !(p.x === q.pin.x && p.y === q.pin.y)) : [...ps, q.pin]);
      });
      if (draggable && aVisible) {
        // While dragging only the line, its label and handle move (no React
        // state, no redraw), so the gesture is smooth and never loses its
        // element. The solver is called once, on release.
        let live = appliedA;
        const round = (a: number) => Math.round(Math.max(0, a) * 10) / 10;
        const moveTo = (a: number) => {
          live = round(a);
          const yy = Math.max(T, Math.min(B, y(live)));
          g.selectAll(".applied-line").attr("y1", yy).attr("y2", yy);
          g.selectAll(".applied-handle, .applied-focus").attr("cy", yy);
          g.select(".applied-label").attr("y", yy - 12 < T + 12 ? yy + 18 : yy - 8).text(`a = ${fmt(live)} m/s²`);
          g.selectAll(".growing-band").attr("visibility", "hidden");
          hit.attr("y", yy - 10).attr("aria-valuenow", live).attr("aria-valuetext", `${fmt(live)} m/s²`);
        };
        const hit = g.append("rect").attr("class", "applied-hit").attr("x", L).attr("y", ay - 10)
          .attr("width", R - L + 10).attr("height", 20).attr("fill", "transparent").style("cursor", "ns-resize")
          .attr("tabindex", 0).attr("role", "slider").attr("aria-label", "Applied acceleration")
          .attr("aria-valuemin", 0).attr("aria-valuemax", Math.round(y.domain()[1])).attr("aria-valuenow", appliedA)
          .attr("aria-valuetext", `${fmt(appliedA)} m/s²`)
          .on("focus", () => g.select(".applied-focus").attr("visibility", "visible"))
          .on("blur", () => g.select(".applied-focus").attr("visibility", "hidden"))
          .on("keydown", (ev: KeyboardEvent) => {
            const step = ev.shiftKey ? 10 : 1;
            const d = ev.key === "ArrowUp" || ev.key === "ArrowRight" ? step : ev.key === "ArrowDown" || ev.key === "ArrowLeft" ? -step
              : ev.key === "PageUp" ? 10 : ev.key === "PageDown" ? -10 : 0;
            if (!d) return;
            ev.preventDefault();
            moveTo(live + d);
            keepFocus.current = true;
            onAppliedChange(live);              // parent debounces the solver call
          });
        hit.call(d3.drag<SVGRectElement, unknown>()
          .on("start", () => { dragging = true; setTip(null); cursor.attr("visibility", "hidden"); })
          .on("drag", e => moveTo(y.invert(Math.max(T, Math.min(B, e.y)))))
          .on("end", () => { dragging = false; if (live !== appliedA) onAppliedChange(live); }));
        if (keepFocus.current) { (hit.node() as SVGRectElement).focus(); }
      }
    } else {
      setTip(null);
      bindAxes({ svg, g, content: plot, x, y, box, mode, setView });
    }
  }, [r, plots, appliedA, hot, draggable, finite, onAppliedChange, clipId, width, mode, view, pins, setView, setPins]);

  const exportCsv = () => downloadText("stability_chart.csv", csv(
    ["series", "label", "wavenumber_per_mm", "wavelength_mm", "a_m_s2"],
    [
      ...plots.tongues.flatMap(c => c.points.map(p => [`${c.response}_boundary`, "", p.wavenumber_per_mm, p.wavelength_mm, p.a_m_s2 ?? ""])),
      ...plots.allowed_modes.map(m => [`allowed_mode_${m.response}`, `"${m.label}"`, m.wavenumber_per_mm, "", m.critical_acceleration_m_s2]),
    ],
    { inputs: r.inputs, provenance: r.provenance },
  ), "text/csv");

  return (
    <div>
      <AxesToolbar active={mode !== "datatip" || !!view || pins.length > 0} mode={mode} setMode={ax.setMode}
        pinCount={pins.length} onClearPins={() => setPins([])} canRestore={!!view} onRestore={() => setView(null)}
        onPng={() => downloadPng(ref.current, "stability_chart.png")}
        onSvg={() => downloadSvg(ref.current, "stability_chart.svg")} onCsv={exportCsv} />
      <div ref={wrapRef} className="plot">
        <svg ref={ref} role="img" aria-label={`Stability chart, forcing acceleration against wavenumber. Onset threshold ${fmt(r.results.critical_acceleration_m_s2)} m/s². Applied ${fmt(appliedA)} m/s².`} style={{ display: "block" }} />
        <DataTip tip={tip} />
      </div>
    </div>
  );
}
