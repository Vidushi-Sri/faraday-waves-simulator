// Shared scientific-figure conventions (MATLAB / Origin / journal style) so
// every chart in the app reads as one instrument:
//   boxed axes, inward major + minor ticks on all four sides, light grid on
//   major ticks only, tabular tick labels, axis titles with units in
//   parentheses, data cursor that snaps to the solver's computed points.
// Display only: nothing here derives physics.
import * as d3 from "d3";

export const FONT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
export const PLOT = {
  frame: "#393939", grid: "#e8e8e8", tick: "#393939", label: "#393939", title: "#161616",
};

type G = d3.Selection<SVGGElement, unknown, null, undefined>;
export interface Margins { t: number; r: number; b: number; l: number }

/** Minor-tick step for a d3 1/2/5 major step (5, 4 or 5 subdivisions). */
function minorStep(major: number) {
  const lead = Math.round(major / 10 ** Math.floor(Math.log10(major)));
  return major / (lead === 2 ? 4 : 5);
}

function minorTicks(domain: number[], majors: number[]) {
  if (majors.length < 2) return [];
  const s = minorStep(majors[1] - majors[0]);
  const [lo, hi] = [Math.min(...domain), Math.max(...domain)];
  const out: number[] = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + s * 1e-9; v += s) {
    if (!majors.some(m => Math.abs(m - v) < s * 1e-6)) out.push(v);
  }
  return out;
}

/** Width of the widest label, so the left margin fits the real tick text. */
export function measure(g: G, labels: string[], size = 12) {
  const probe = g.append("text").attr("font-size", size).attr("font-family", FONT);
  const w = d3.max(labels, s => { probe.text(s); return (probe.node() as SVGTextElement).getBBox().width; }) ?? 0;
  probe.remove();
  return Math.ceil(w);
}

export function drawFrame(
  g: G, x: d3.ScaleLinear<number, number>, y: d3.ScaleLinear<number, number>,
  o: { xTicks: number[]; yTicks: number[]; xFmt: (v: number) => string; yFmt: (v: number) => string;
       xTitle: string; yTitle: string; M: Margins; W: number; H: number; grid?: "y" | "xy" | "none" },
) {
  const { M, W, H } = o;
  const [L, R, T, B] = [M.l, W - M.r, M.t, H - M.b];
  const grid = g.append("g").attr("pointer-events", "none");
  if (o.grid !== "none") o.yTicks.forEach(t => grid.append("line").attr("x1", L).attr("x2", R).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", PLOT.grid));
  if (o.grid === "xy") o.xTicks.forEach(t => grid.append("line").attr("y1", T).attr("y2", B).attr("x1", x(t)).attr("x2", x(t)).attr("stroke", PLOT.grid));
  return {
    grid,
    /** Call AFTER the data so the frame and ticks sit on top of fills. */
    finish() {
      const f = g.append("g").attr("pointer-events", "none").attr("stroke", PLOT.tick).attr("shape-rendering", "crispEdges");
      const tick = (x1: number, y1: number, x2: number, y2: number) =>
        f.append("line").attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
      for (const [vals, len] of [[o.xTicks, 6], [minorTicks(x.domain(), o.xTicks), 3]] as const)
        vals.forEach(v => { const px = Math.round(x(v)) + 0.5; tick(px, B, px, B - len); tick(px, T, px, T + len); });
      for (const [vals, len] of [[o.yTicks, 6], [minorTicks(y.domain(), o.yTicks), 3]] as const)
        vals.forEach(v => { const py = Math.round(y(v)) + 0.5; tick(L, py, L + len, py); tick(R, py, R - len, py); });
      g.append("rect").attr("x", L + 0.5).attr("y", T + 0.5).attr("width", R - L - 1).attr("height", B - T - 1)
        .attr("fill", "none").attr("stroke", PLOT.frame).attr("shape-rendering", "crispEdges").attr("pointer-events", "none");

      const lab = (px: number, py: number, s: string, anchor: string) =>
        g.append("text").attr("class", "tick-label").attr("x", px).attr("y", py).attr("text-anchor", anchor).attr("font-size", 12)
          .attr("font-family", FONT).attr("fill", PLOT.label).style("font-variant-numeric", "tabular-nums").text(s);
      o.xTicks.forEach(v => lab(x(v), B + 18, o.xFmt(v), "middle"));
      o.yTicks.forEach(v => lab(L - 8, y(v) + 4, o.yFmt(v), "end").attr("data-y", y(v)));
      g.append("text").attr("x", (L + R) / 2).attr("y", H - 8).attr("text-anchor", "middle")
        .attr("font-size", 14).attr("font-family", FONT).attr("fill", PLOT.title).text(o.xTitle);
      g.append("text").attr("transform", "rotate(-90)").attr("x", -(T + B) / 2).attr("y", 16)
        .attr("text-anchor", "middle").attr("font-size", 14).attr("font-family", FONT).attr("fill", PLOT.title).text(o.yTitle);
    },
  };
}

/** 4 significant figures for data-cursor readouts (instrument precision). */
export const sig4 = (v: number) => {
  if (!isFinite(v)) return "--";
  const s = Number(v.toPrecision(4));
  return Math.abs(s) >= 1000 ? s.toLocaleString("en-US") : String(s);
};

// ---- Export (reproducibility: every file carries the inputs that made it)

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: SVGSVGElement | null, name: string) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadText(name, new XMLSerializer().serializeToString(clone), "image/svg+xml");
}

/** CSV with a commented header recording the exact request and model. */
export function csv(header: string[], rows: (string | number)[][], meta: Record<string, unknown>) {
  const comments = Object.entries(meta).map(([k, v]) => `# ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return [...comments, header.join(","), ...rows.map(r => r.join(","))].join("\n") + "\n";
}

// ---- Legend inside the figure (MATLAB 'southoutside', horizontal, boxed),
// so it is part of exported SVGs. Rows wrap and each row is centred.
export interface LegendEntry { label: string; swatch: (g: G) => void }

export function layoutLegend(g: G, items: LegendEntry[], L: number, R: number) {
  const SW = 22, GAP = 6, SEP = 20, ROW = 20, PADX = 12, PADY = 6;
  const widths = items.map(i => SW + GAP + measure(g, [i.label]));
  const maxW = R - L - 2 * PADX;
  // aligned column grid: the most columns whose widest entries still fit
  let cols = items.length, colW: number[] = [];
  for (; cols >= 1; cols--) {
    colW = Array.from({ length: cols }, (_, c) => Math.max(...widths.filter((_, i) => i % cols === c)));
    if (colW.reduce((s, v) => s + v, 0) + SEP * (cols - 1) <= maxW) break;
  }
  cols = Math.max(cols, 1);
  // balance the rows (3 + 3, not 5 + 1): fewest rows, then as few columns as fill them
  const rows = Math.ceil(items.length / cols);
  cols = Math.ceil(items.length / rows);
  colW = Array.from({ length: cols }, (_, c) => Math.max(...widths.filter((_, i) => i % cols === c)));
  const boxW = colW.reduce((s, v) => s + v, 0) + SEP * (cols - 1) + 2 * PADX;
  const height = rows * ROW + 2 * PADY;
  return {
    height,
    draw(top: number) {
      const lg = g.append("g").attr("class", "legend-box");
      const bx = Math.round((L + R - boxW) / 2);
      lg.append("rect").attr("x", bx + 0.5).attr("y", top + 0.5).attr("width", Math.round(boxW))
        .attr("height", height).attr("fill", "#fff").attr("stroke", "#a8a8a8").attr("shape-rendering", "crispEdges");
      items.forEach((item, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const x = bx + PADX + colW.slice(0, c).reduce((s, v) => s + v + SEP, 0);
        const sg = lg.append("g").attr("transform", `translate(${x},${top + PADY + r * ROW + ROW / 2})`);
        item.swatch(sg);
        sg.append("text").attr("x", SW + GAP).attr("y", 4).attr("font-size", 12).attr("font-family", FONT)
          .attr("fill", PLOT.title).text(item.label);
      });
    },
  };
}
