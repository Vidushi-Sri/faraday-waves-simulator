import { useEffect, useId, useRef, useState } from "react";
import * as d3 from "d3";
import type { CriticalResponse } from "../api/types";
import { modeLabel, sig4 } from "../lib/text";
import { csv, downloadSvg, downloadText, drawFrame, FONT, measure } from "../lib/plot";
import { bindAxes, downloadPng, drawPins, type Pin } from "../lib/axes";
import { AxesToolbar, DataTip, useAxesState, useWidth, type Tip } from "./ChartTools";
import { ELEVATION_SCHEME, RESPONSE_COLOR } from "../lib/colors";

/**
 * Onset pattern of the critical mode, exactly as container.pattern() returns
 * it on faraday_floquet.plot_mode's grid:
 *   infinite layer / channel -> 1-D profile cos(k x)          (line plot)
 *   box / upright cylinder   -> 2-D surface elevation field   (top-view heatmap,
 *                               equal axis scaling, diverging blue-white-red
 *                               like the solver's RdBu_r, with a colour bar)
 * Values are normalised to max |eta| = 1 by the backend: arbitrary units.
 */
const LINE_H = 380;

export function PatternChart({ r }: { r: CriticalResponse }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const ref = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const ax = useAxesState(r);
  const clipId = `pat-clip-${useId().replace(/:/g, "")}`;
  const pat = r.plots?.pattern ?? null;
  const color = RESPONSE_COLOR[r.results.critical_mode?.response ?? "subharmonic"];
  const { mode, view, pins, setView, setPins } = ax;

  useEffect(() => {
    const svgEl = ref.current;
    if (!svgEl || !pat || width < 200) return;
    const W = width;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.on(".", null);
    const g = svg.append("g");
    const fmtT = d3.format("~g");
    const xs = pat.x_mm;
    const xExt = d3.extent(xs) as [number, number];

    let x: d3.ScaleLinear<number, number>, y: d3.ScaleLinear<number, number>;
    let H: number, box: { L: number; R: number; T: number; B: number };
    type Pt = { px: number; py: number; pin: Pin };
    let pts: Pt[] = [];

    if (pat.kind === "line") {
      const vals = pat.values as number[];
      x = d3.scaleLinear(view?.x ?? xExt, [0, 1]);
      y = d3.scaleLinear(view?.y ?? [-1.2, 1.2], [0, 1]);
      const yTicks = y.ticks(5), xTicks = x.ticks(Math.max(2, Math.min(6, Math.floor(W / 90))));
      const M = { t: 12, r: 16, b: 46, l: measure(g, yTicks.map(fmtT)) + 8 + 28 };
      H = LINE_H;
      box = { L: M.l, R: W - M.r, T: M.t, B: H - M.b };
      x.range([box.L, box.R]); y.range([box.B, box.T]);
      svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("font-family", FONT).style("background", "#fff");
      const frame = drawFrame(g, x, y, { xTicks, yTicks, xFmt: fmtT, yFmt: fmtT, M, W, H,
        xTitle: "Position x (mm)", yTitle: "Surface elevation η (arbitrary units)" });
      svg.append("defs").append("clipPath").attr("id", clipId)
        .append("rect").attr("x", box.L).attr("y", box.T).attr("width", box.R - box.L).attr("height", box.B - box.T);
      const plot = g.append("g").attr("clip-path", `url(#${clipId})`).append("g");
      plot.append("line").attr("x1", box.L - 4000).attr("x2", box.R + 4000).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", "#8d8d8d");
      plot.append("path").datum(xs.map((v, i) => [v, vals[i]] as [number, number]))
        .attr("d", d3.line().x(d => x(d[0])).y(d => y(d[1]))).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2);
      frame.finish();
      pts = xs.map((v, i) => ({ px: x(v), py: y(vals[i]),
        pin: { x: v, y: vals[i], title: "Computed point", rows: [["x", `${sig4(v)} mm`], ["η", sig4(vals[i])]] as [string, string][] } }));
      wire(plot);
    } else {
      const ys = pat.y_mm!;
      const grid = pat.values as (number | null)[][];
      const yExt = d3.extent(ys) as [number, number];
      const CB = 64;                                     // colour bar column
      const probe = measure(g, ["-00.0"]);
      const M = { t: 12, r: 16 + CB, b: 46, l: probe + 8 + 28 };
      const vx = view?.x ?? xExt, vy = view?.y ?? yExt;
      // equal axis scaling (MATLAB "axis equal"): 1 mm is the same length on x and y
      const s = Math.min((W - M.l - M.r) / (vx[1] - vx[0]), 420 / (vy[1] - vy[0]));
      const pw = (vx[1] - vx[0]) * s, ph = (vy[1] - vy[0]) * s;
      H = ph + M.t + M.b;
      const L = M.l + ((W - M.l - M.r) - pw) / 2;
      box = { L, R: L + pw, T: M.t, B: M.t + ph };
      x = d3.scaleLinear(vx, [box.L, box.R]);
      y = d3.scaleLinear(vy, [box.B, box.T]);
      svg.attr("width", W).attr("height", H).attr("viewBox", `0 0 ${W} ${H}`).attr("font-family", FONT).style("background", "#fff");
      const xTicks = x.ticks(Math.max(2, Math.floor(pw / 80))), yTicks = y.ticks(Math.max(2, Math.floor(ph / 60)));
      const frame = drawFrame(g, x, y, { xTicks, yTicks, xFmt: fmtT, yFmt: fmtT, M: { ...M, l: box.L, r: W - box.R }, W, H,
        xTitle: "x (mm)", yTitle: "y (mm)", grid: "none" });

      // field -> canvas (one pixel per grid point), placed as an image: smooth, light, exportable
      const nx = xs.length, ny = ys.length;
      const canvas = Object.assign(document.createElement("canvas"), { width: nx, height: ny });
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(nx, ny);
      grid.forEach((row, j) => row.forEach((v, i) => {
        const o = ((ny - 1 - j) * nx + i) * 4;               // row 0 is the lowest y
        if (v == null) { img.data[o + 3] = 0; return; }
        const c = d3.color(ELEVATION_SCHEME(v))!.rgb();
        img.data[o] = c.r; img.data[o + 1] = c.g; img.data[o + 2] = c.b; img.data[o + 3] = 255;
      }));
      ctx.putImageData(img, 0, 0);
      svg.append("defs").append("clipPath").attr("id", clipId)
        .append("rect").attr("x", box.L).attr("y", box.T).attr("width", pw).attr("height", ph);
      const plot = g.append("g").attr("clip-path", `url(#${clipId})`).append("g");
      const dx = (xExt[1] - xExt[0]) / (nx - 1) / 2, dy = (yExt[1] - yExt[0]) / (ny - 1) / 2;
      plot.append("image").attr("href", canvas.toDataURL()).attr("preserveAspectRatio", "none")
        .attr("x", x(xExt[0] - dx)).attr("y", y(yExt[1] + dy))
        .attr("width", x(xExt[1] + dx) - x(xExt[0] - dx)).attr("height", y(yExt[0] - dy) - y(yExt[1] + dy));
      // container wall
      const geo = r.inputs.geometry;
      if (geo.shape === "cylinder" && geo.R)
        plot.append("ellipse").attr("cx", x(0)).attr("cy", y(0)).attr("rx", x(geo.R * 1e3) - x(0)).attr("ry", y(0) - y(geo.R * 1e3))
          .attr("fill", "none").attr("stroke", "#161616").attr("stroke-width", 1.5);
      frame.finish();

      // colour bar
      const cbX = box.R + 20, cbW = 12;
      const cb = d3.scaleLinear([-1, 1], [box.B, box.T]);
      const gid = `${clipId}-cb`;
      const grad = svg.select("defs").append("linearGradient").attr("id", gid).attr("x1", 0).attr("y1", 1).attr("x2", 0).attr("y2", 0);
      d3.range(-1, 1.001, 0.25).forEach(t => grad.append("stop").attr("offset", `${((t + 1) / 2) * 100}%`).attr("stop-color", ELEVATION_SCHEME(t)));
      g.append("rect").attr("x", cbX).attr("y", box.T).attr("width", cbW).attr("height", ph).attr("fill", `url(#${gid})`).attr("stroke", "#393939");
      [-1, 0, 1].forEach(t => {
        g.append("line").attr("x1", cbX + cbW).attr("x2", cbX + cbW + 4).attr("y1", cb(t)).attr("y2", cb(t)).attr("stroke", "#393939");
        g.append("text").attr("x", cbX + cbW + 7).attr("y", cb(t) + 4).attr("font-size", 12).attr("fill", "#393939").text(fmtT(t));
      });
      g.append("text").attr("transform", `translate(${cbX + cbW + 40},${(box.T + box.B) / 2}) rotate(90)`)
        .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#161616").text("η (arb.)");

      pts = [];
      ys.forEach((yv, j) => xs.forEach((xv, i) => {
        const v = grid[j][i];
        if (v != null && i % 2 === 0 && j % 2 === 0)
          pts.push({ px: x(xv), py: y(yv), pin: { x: xv, y: yv, title: "Grid point",
            rows: [["x", `${sig4(xv)} mm`], ["y", `${sig4(yv)} mm`], ["η", sig4(v)]] } });
      }));
      wire(plot);
    }

    function wire(plot: d3.Selection<SVGGElement, unknown, null, undefined>) {
      drawPins(g, pins, x, y, box, i => setPins(ps => ps.filter((_, j) => j !== i)));
      const inBox = pts.filter(q => q.px >= box.L && q.px <= box.R && q.py >= box.T && q.py <= box.B);
      const nearest = (ev: MouseEvent) => {
        const [mx, my] = d3.pointer(ev, svgEl);
        if (mx < box.L || mx > box.R || my < box.T || my > box.B) return null;
        return d3.least(inBox, p => (p.px - mx) ** 2 + (p.py - my) ** 2) ?? null;
      };
      if (mode === "datatip") {
        const cursor = g.append("rect").attr("width", 8).attr("height", 8).attr("fill", "none")
          .attr("stroke", "#161616").attr("stroke-width", 1.5).attr("visibility", "hidden").attr("pointer-events", "none");
        svg.on("pointermove", (ev: PointerEvent) => {
          if ((ev.target as Element | null)?.closest?.(".pin")) { cursor.attr("visibility", "hidden"); setTip(null); return; }
          const q = nearest(ev);
          if (!q) { cursor.attr("visibility", "hidden"); setTip(null); return; }
          cursor.attr("x", q.px - 4).attr("y", q.py - 4).attr("visibility", "visible");
          setTip({ left: q.px, top: q.py - 10, flip: q.px > W * 0.6, title: q.pin.title, rows: q.pin.rows });
        });
        svg.on("pointerleave", () => { cursor.attr("visibility", "hidden"); setTip(null); });
        svg.on("click", (ev: MouseEvent) => {
          if ((ev.target as Element | null)?.closest?.(".pin")) return;
          const q = nearest(ev);
          if (q) setPins(ps => ps.some(p => p.x === q.pin.x && p.y === q.pin.y)
            ? ps.filter(p => !(p.x === q.pin.x && p.y === q.pin.y)) : [...ps, q.pin]);
        });
      } else {
        setTip(null);
        bindAxes({ svg, g, content: plot, x, y, box, mode, setView });
      }
    }
  }, [pat, r, width, color, clipId, mode, view, pins, setView, setPins]);

  const exportCsv = () => {
    if (!pat) return;
    const rows = pat.kind === "line"
      ? pat.x_mm.map((v, i) => [v, (pat.values as number[])[i]])
      : pat.y_mm!.flatMap((yv, j) => pat.x_mm.map((xv, i) => [xv, yv, (pat.values as (number | null)[][])[j][i] ?? ""]));
    downloadText("onset_pattern.csv", csv(pat.kind === "line" ? ["x_mm", "eta_normalised"] : ["x_mm", "y_mm", "eta_normalised"], rows,
      { mode: r.results.critical_mode?.label ?? "", inputs: r.inputs, provenance: r.provenance }), "text/csv");
  };

  if (!pat) return <p className="chart-empty">No critical mode, so there is no onset pattern to show.</p>;
  return (
    <div>
      <AxesToolbar active={mode !== "datatip" || !!view || pins.length > 0} mode={mode} setMode={ax.setMode}
        pinCount={pins.length} onClearPins={() => setPins([])} canRestore={!!view} onRestore={() => setView(null)}
        onPng={() => downloadPng(ref.current, "onset_pattern.png")}
        onSvg={() => downloadSvg(ref.current, "onset_pattern.svg")} onCsv={exportCsv} />
      <div ref={wrapRef} className="plot">
        <svg ref={ref} role="img" style={{ display: "block" }}
          aria-label={`Onset pattern of mode ${modeLabel(r.results.critical_mode?.label ?? "")}, ${pat.kind === "field" ? "top view" : "profile"}.`} />
        <DataTip tip={tip} />
      </div>
    </div>
  );
}
