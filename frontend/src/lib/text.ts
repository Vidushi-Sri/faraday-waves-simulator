// All descriptive text is TEMPLATED from the API response, so the UI can never
// say something the solver did not return. Display formatting only.
import type { CriticalResponse, Mode, Provenance, Shape } from "../api/types";

/** 3 significant figures for small values (never "0.00"), separators for large. */
export const fmt = (x: number | null | undefined, d = 2): string => {
  if (x == null || !isFinite(x)) return "--";
  const ax = Math.abs(x);
  if (ax !== 0 && ax < 10 ** -d) return x.toPrecision(3);
  if (ax >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (ax >= 100) return x.toFixed(Math.min(d, 1));
  return x.toFixed(d);
};

/** 4 significant figures, for tables and data tips (instrument precision). */
export const sig4 = (x: number | null | undefined): string => {
  if (x == null || !isFinite(x)) return "--";
  const s = Number(x.toPrecision(4));
  return Math.abs(s) >= 1000 ? s.toLocaleString("en-US") : String(s);
};

/** Input values exactly as entered, compact (1e-4 stays 1e-4). */
export const raw = (x: number) => (Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential() : String(x));

export const SHAPE_NAME: Record<Shape, string> = {
  infinite: "Infinite layer", channel: "Channel", box: "Rectangular box", cylinder: "Upright cylinder",
};

/** Solver mode labels, tidied for reading: "(m,n)=(1,2)" -> "(m, n) = (1, 2)". */
export const modeLabel = (label: string) =>
  label === "k_c" ? "kc (critical)" : label.replace(/=/g, " = ").replace(/,/g, ", ");

export const responseWord = (r: Mode["response"]) => (r === "subharmonic" ? "Subharmonic" : "Harmonic");
export const responseFreq = (r: Mode["response"]) => (r === "subharmonic" ? "f/2" : "f");

export function statusShort(r: CriticalResponse): string {
  return r.results.status === "unstable" ? "Unstable"
    : r.results.status === "stable" ? "Stable" : "No threshold found";
}

export function verdictConsequence(r: CriticalResponse): string {
  const m = r.results.critical_mode;
  if (r.results.status === "no_critical_mode_found" || !m)
    return "No unstable mode was found in the searched wavenumber range.";
  const q = r.results.ratio_applied_to_critical ?? 0;
  if (r.results.status === "unstable" && q > 5)
    return "The surface is unstable, but the forcing is far above onset: the motion is strongly nonlinear, which linear theory does not describe. Check the input units.";
  if (r.results.status === "unstable")
    return "The applied acceleration exceeds the onset threshold, so small surface disturbances grow into standing waves.";
  return "The applied acceleration is below the onset threshold, so small disturbances decay and the surface remains flat.";
}

export function ratioLabel(r: CriticalResponse): string {
  const q = r.results.ratio_applied_to_critical;
  if (q == null) return "";
  if (q >= 2) return `${q >= 100 ? Math.round(q).toLocaleString("en-US") : q.toFixed(1)} × the onset threshold`;
  const pct = Math.abs(q - 1) * 100;
  const p = pct < 1 ? pct.toFixed(1) : Math.round(pct).toString();
  return `${p}% ${q > 1 ? "above" : "below"} onset`;
}

export function interpretation(r: CriticalResponse): string {
  const { results: res, inputs } = r;
  const m = res.critical_mode;
  if (!m || res.critical_acceleration_m_s2 == null) return verdictConsequence(r);
  const f = String(inputs.frequency_hz);
  const ac = fmt(res.critical_acceleration_m_s2);
  const a = fmt(res.applied_acceleration_m_s2);
  const where = r.model.geometry === "infinite" ? "" : ` in this ${SHAPE_NAME[r.model.geometry].toLowerCase()}`;
  const mode = r.model.geometry === "infinite" ? "" : `, mode ${modeLabel(m.label)},`;
  const s = m.growth_rate_per_s;
  const resp = m.response === "subharmonic"
    ? "oscillates at half the drive frequency (subharmonic response)"
    : "oscillates at the drive frequency (harmonic response)";
  // above onset the fastest-growing mode can differ from the critical one (the solver CLI reports both)
  const fast = res.fastest_unstable_mode;
  const fastNote = fast && fast.label !== m.label && fast.growth_rate_per_s != null
    ? ` At this forcing the fastest-growing mode is ${modeLabel(fast.label)} (λ = ${fmt(fast.wavelength_mm)} mm, ${fmt(fast.growth_rate_per_s)} s⁻¹).`
    : "";
  if (res.status === "unstable")
    return `At ${f} Hz${where}, the onset threshold is ${ac} m/s². The applied acceleration of ${a} m/s² exceeds it, so the surface is unstable. ` +
      `The critical mode${mode} has a wavelength of ${fmt(m.wavelength_mm)} mm, ${resp}` +
      (s != null ? ` and grows at ${fmt(s)} s⁻¹.` : ".") + fastNote;
  return `At ${f} Hz${where}, the onset threshold is ${ac} m/s². The applied acceleration of ${a} m/s² is below it, ` +
    `so disturbances decay` + (s != null ? ` at ${fmt(Math.abs(s))} s⁻¹` : "") + ` and the surface remains flat. Waves appear once the acceleration exceeds ${ac} m/s².`;
}

export function stabilityCaption(r: CriticalResponse): string {
  const finite = r.model.geometry !== "infinite";
  const a = fmt(r.results.applied_acceleration_m_s2);
  const base = finite
    ? `Curves give the onset threshold of each wavenumber (subharmonic solid, harmonic dashed); forcing just above a curve destabilises that wavenumber. Markers are the modes the container allows; filled markers are unstable at the applied acceleration (dashed line, ${a} m/s²).`
    : `Curves give the onset threshold of each wavenumber (subharmonic solid, harmonic dashed); forcing just above a curve destabilises that wavenumber. The dashed line marks the applied acceleration (${a} m/s²); where it crosses above a curve, those wavenumbers grow.`;
  return base;
}

export function patternCaption(r: CriticalResponse): string {
  const m = r.results.critical_mode;
  if (!m) return "No critical mode, so there is no onset pattern.";
  const base = r.plots?.pattern?.kind === "field"
    ? `Top view of the critical mode ${modeLabel(m.label)} at onset. Red: surface raised; blue: surface lowered (arbitrary amplitude).`
    : "Surface profile of the critical mode at onset over one wavelength (arbitrary amplitude).";
  return base + nearTieNote(r);
}

// modes whose threshold lies within 0.1% of the critical one; linear theory cannot pick between them
export function nearTieNote(r: CriticalResponse): string {
  const m = r.results.critical_mode;
  const ac = m?.critical_acceleration_m_s2;
  const all = r.plots?.allowed_modes ?? [];
  if (!m || ac == null || all.length === 0) return "";
  const ties = all
    .filter((x) => x.label !== m.label && Math.abs(x.critical_acceleration_m_s2 - ac) <= 1e-3 * ac)
    .sort((a, b) => a.critical_acceleration_m_s2 - b.critical_acceleration_m_s2);
  if (ties.length === 0) return "";
  // keep only the index pair, e.g. "(22, 4)", so the list reads cleanly
  const names = ties.slice(0, 3).map((x) => modeLabel(x.label).replace(/^.*=\s*/, "")).join(", ");
  const more = ties.length > 3 ? ` and ${ties.length - 3} more` : "";
  return ` ${ties.length === 1 ? "Mode" : "Modes"} ${names}${more} ${ties.length === 1 ? "has a threshold" : "have thresholds"} within 0.1% of this one, so linear theory alone cannot say which pattern appears first.`;
}

export function provenanceLine(p: Provenance): string {
  const when = new Date(p.computed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  return `Computed ${when} with linear viscous Floquet theory (Kumar 1996). Exported data and figures record all inputs and the model version.`;
}
