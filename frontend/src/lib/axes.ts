// MATLAB-style axes interactions, shared by every chart:
//   datatip  hover shows the nearest computed point; click pins it (pins are
//            drawn in the SVG, so they appear in exports)
//   pan      drag to move the view; wheel zooms about the pointer
//   zoomin   drag a box to zoom to it, or click to zoom 2x about the pointer
//   zoomout  click to zoom out 2x about the pointer
// "Restore view" clears the stored view so the chart returns to its default
// limits. Views only change what is shown; data is never resampled.
import * as d3 from "d3";
import { FONT } from "./plot";

export type AxesMode = "datatip" | "pan" | "zoomin" | "zoomout";
export interface View { x: [number, number]; y: [number, number] }
export interface Pin { x: number; y: number; title: string; rows: [string, string][] }

type Lin = d3.ScaleLinear<number, number>;
type G = d3.Selection<SVGGElement, unknown, null, undefined>;
type Svg = d3.Selection<SVGSVGElement, unknown, null, undefined>;
interface Box { L: number; R: number; T: number; B: number }

const CURSOR: Record<AxesMode, string> = { datatip: "default", pan: "grab", zoomin: "zoom-in", zoomout: "zoom-out" };

export function bindAxes(o: {
  svg: Svg; g: G; content: G; x: Lin; y: Lin; box: Box; mode: AxesMode; setView: (v: View) => void;
}) {
  const { L, R, T, B } = o.box;
  const zoomAt = (px: number, py: number, f: number) => {
    const [x0, x1] = o.x.domain(), [y0, y1] = o.y.domain();
    const cx = o.x.invert(px), cy = o.y.invert(py);
    o.setView({ x: [cx - (cx - x0) / f, cx + (x1 - cx) / f], y: [cy - (cy - y0) / f, cy + (y1 - cy) / f] });
  };
  if (o.mode === "datatip") return;

  const overlay = o.g.append("rect").attr("x", L).attr("y", T).attr("width", R - L).attr("height", B - T)
    .attr("fill", "transparent").style("cursor", CURSOR[o.mode]);
  const svgNode = o.svg.node()!;

  overlay.on("wheel", (ev: WheelEvent) => {
    ev.preventDefault();
    const [px, py] = d3.pointer(ev, svgNode);
    zoomAt(px, py, ev.deltaY < 0 ? 1.25 : 0.8);
  });

  if (o.mode === "zoomout") {
    overlay.on("click", (ev: MouseEvent) => { const [px, py] = d3.pointer(ev, svgNode); zoomAt(px, py, 0.5); });
    return;
  }

  let start: [number, number] | null = null;
  const band = o.g.append("rect").attr("fill", "rgba(15,98,254,0.08)").attr("stroke", "#0f62fe")
    .attr("stroke-dasharray", "4 2").attr("visibility", "hidden").attr("pointer-events", "none");
  const clampX = (v: number) => Math.max(L, Math.min(R, v)), clampY = (v: number) => Math.max(T, Math.min(B, v));

  overlay.call(d3.drag<SVGRectElement, unknown>()
    .on("start", ev => { start = [ev.x, ev.y]; if (o.mode === "pan") overlay.style("cursor", "grabbing"); })
    .on("drag", ev => {
      if (!start) return;
      if (o.mode === "pan") {
        o.content.attr("transform", `translate(${ev.x - start[0]},${ev.y - start[1]})`);
      } else {
        const [x0, y0] = start, x1 = clampX(ev.x), y1 = clampY(ev.y);
        band.attr("x", Math.min(x0, x1)).attr("y", Math.min(y0, y1))
          .attr("width", Math.abs(x1 - x0)).attr("height", Math.abs(y1 - y0)).attr("visibility", "visible");
      }
    })
    .on("end", ev => {
      if (!start) return;
      const [x0, y0] = start;
      start = null;
      if (o.mode === "pan") {
        const dx = o.x.invert(x0) - o.x.invert(ev.x), dy = o.y.invert(y0) - o.y.invert(ev.y);
        const [a, b] = o.x.domain(), [c, d] = o.y.domain();
        o.setView({ x: [a + dx, b + dx], y: [c + dy, d + dy] });
        return;
      }
      band.attr("visibility", "hidden");
      const x1 = clampX(ev.x), y1 = clampY(ev.y);
      if (Math.abs(x1 - x0) < 6 || Math.abs(y1 - y0) < 6) { zoomAt(x0, y0, 2); return; }
      const xs = [o.x.invert(x0), o.x.invert(x1)].sort((p, q) => p - q) as [number, number];
      const ys = [o.y.invert(y0), o.y.invert(y1)].sort((p, q) => p - q) as [number, number];
      o.setView({ x: xs, y: ys });
    }));
}

/** Draw pinned data tips into the SVG (so PNG/SVG exports include them). */
export function drawPins(g: G, pins: Pin[], x: Lin, y: Lin, box: Box, onRemove: (i: number) => void) {
  pins.forEach((p, i) => {
    const px = x(p.x), py = y(p.y);
    if (px < box.L || px > box.R || py < box.T || py > box.B) return;
    const pg = g.append("g").attr("class", "pin").style("cursor", "pointer")
      .on("click", (ev: MouseEvent) => { ev.stopPropagation(); onRemove(i); });
    pg.append("title").text("Click to remove this data tip");
    pg.append("rect").attr("x", px - 4).attr("y", py - 4).attr("width", 8).attr("height", 8)
      .attr("fill", "#fff").attr("stroke", "#161616").attr("stroke-width", 1.5);
    const lines = [p.title, ...p.rows.map(([k, v]) => `${k}  ${v}`)];
    const tg = pg.append("g");
    const text = tg.append("text").attr("font-family", FONT).attr("font-size", 12).attr("fill", "#161616");
    lines.forEach((ln, j) => text.append("tspan").attr("x", 0).attr("dy", j ? 16 : 0)
      .attr("font-weight", j === 0 ? 600 : 400).text(ln));
    const bb = (text.node() as SVGTextElement).getBBox();
    const w = bb.width + 16, h = bb.height + 10;
    let bx = px + 10, by = py - h - 6;
    if (bx + w > box.R) bx = px - 10 - w;
    if (by < box.T) by = py + 10;
    tg.insert("rect", "text").attr("x", -8).attr("y", bb.y - 5).attr("width", w + 18).attr("height", h)
      .attr("fill", "#fff").attr("stroke", "#161616");
    // close control, top-right of the box (the whole tip is also clickable)
    tg.append("text").attr("x", w - 4).attr("y", bb.y + 9).attr("font-family", FONT).attr("font-size", 14)
      .attr("fill", "#525252").attr("text-anchor", "middle").text("×");
    tg.attr("transform", `translate(${bx + 8},${by - bb.y + 5})`);
  });
}

/** Rasterise an SVG to PNG at 2x (export as image, as MATLAB's axes toolbar does). */
export async function downloadPng(svg: SVGSVGElement | null, name: string, scale = 2) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const w = Number(svg.getAttribute("width")), h = Number(svg.getAttribute("height"));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: w * scale, height: h * scale });
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.toBlob(b => {
    if (!b) return;
    const url = URL.createObjectURL(b);
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
