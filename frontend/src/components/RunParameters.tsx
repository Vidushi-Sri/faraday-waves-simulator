import type { CriticalResponse } from "../api/types";
import { SHAPE_NAME, raw } from "../lib/text";

/** The exact inputs that produced this result, echoed from the response, so a
 *  screenshot is always scientifically interpretable (handoff section 7). */
export function RunParameters({ r }: { r: CriticalResponse }) {
  const i = r.inputs;
  const g = i.geometry;
  const dims = (["L", "Lx", "Ly", "R"] as const).filter(d => g[d] != null).map(d => [`${d}`, `${raw(g[d]!)} m`]);
  const forcing = i.forcing.kind === "acceleration"
    ? [["a", `${raw(i.forcing.value)} m/s²`]]
    : [["d", `${raw(i.forcing.value)} m`]];
  const items: [string, string][] = [
    ["Geometry", SHAPE_NAME[g.shape]], ...dims as [string, string][],
    ["h", `${raw(i.depth_m)} m`], ["ν", `${raw(i.fluid.kinematic_viscosity_m2_s)} m²/s`],
    ["ρ", `${raw(i.fluid.density_kg_m3)} kg/m³`], ["σ", `${raw(i.fluid.surface_tension_n_m)} N/m`],
    ["f", `${raw(i.frequency_hz)} Hz`], ...forcing as [string, string][],
  ];
  return (
    <div className="run-params">
      <dl className="run-params__list" aria-label="Inputs for this result">
        {items.map(([k, v]) => (
          <div key={k} className="run-params__item"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}
