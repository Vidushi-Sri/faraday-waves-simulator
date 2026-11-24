// Input form: fields, validation and request building.
// RULE: no unit conversion and no physics here. Every field is in the SI unit
// the API and the solver use (handoff section 5), sent exactly as typed.
import type { CriticalRequest, ForcingKind, Shape } from "../api/types";

export interface FormState {
  shape: Shape;
  L: string; Lx: string; Ly: string; R: string;   // m
  depth: string;                                   // m
  nu: string;                                      // m²/s
  rho: string;                                     // kg/m³
  sigma: string;                                   // N/m
  freq: string;                                    // Hz
  forcingKind: ForcingKind;
  forcingValue: string;                            // m/s² or m
}

export type FieldKey = Exclude<keyof FormState, "shape" | "forcingKind">;

/** The four containers the Phase 1 solver supports (faraday_floquet.py). */
export interface ShapeOption { id: Shape; label: string }
export const SHAPE_OPTIONS: ShapeOption[] = [
  { id: "infinite", label: "Infinite layer" },
  { id: "channel", label: "Channel (2-D)" },
  { id: "box", label: "Rectangular box" },
  { id: "cylinder", label: "Upright cylinder" },
];

/** Exactly the dimensions each solver container class takes. */
export const DIMENSIONS: Record<Shape, ("L" | "Lx" | "Ly" | "R")[]> = {
  infinite: [], channel: ["L"], box: ["Lx", "Ly"], cylinder: ["R"],
};

export const LABELS: Record<FieldKey, string> = {
  L: "Channel width L (m)",
  Lx: "Length Lx (m)",
  Ly: "Width Ly (m)",
  R: "Radius R (m)",
  depth: "Liquid depth h (m)",
  nu: "Kinematic viscosity ν (m²/s)",
  rho: "Density ρ (kg/m³)",
  sigma: "Surface tension σ (N/m)",
  freq: "Drive frequency f (Hz)",
  forcingValue: "",                       // depends on how shaking is entered, see forcingLabel()
};

export const forcingLabel = (k: ForcingKind) =>
  k === "acceleration" ? "Acceleration amplitude a (m/s²)" : "Displacement amplitude d (m)";

/** Kumar (1996) Fig. 2 fluid at 60 Hz: the project's validated reference case.
 *  The channel width is the COMSOL validation model (faraday_floquet.py docstring). */
export const REFERENCE: FormState = {
  shape: "infinite",
  L: "0.00401", Lx: "", Ly: "", R: "",
  depth: "0.0029", nu: "1.0e-4", rho: "1220", sigma: "0.065",
  freq: "60", forcingKind: "acceleration", forcingValue: "100",
};

/** Strict parse: "" -> null, "12abc" -> NaN (parseFloat would accept 12). */
export function parseNumber(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function activeFields(s: FormState): FieldKey[] {
  return [...DIMENSIONS[s.shape], "depth", "nu", "rho", "sigma", "freq", "forcingValue"];
}

export type FormErrors = Partial<Record<FieldKey, string>>;

export function validate(s: FormState): FormErrors {
  const errors: FormErrors = {};
  for (const k of activeFields(s)) {
    const n = parseNumber(s[k]);
    const allowZero = k === "forcingValue";
    if (n === null) errors[k] = "A value is required.";
    else if (Number.isNaN(n)) errors[k] = "Enter a number, for example 0.065 or 1.0e-4.";
    else if (allowZero ? n < 0 : n <= 0) errors[k] = allowZero ? "Cannot be negative." : "Must be greater than zero.";
  }
  return errors;
}

/** Call only after validate() returned no errors. */
export function buildRequest(s: FormState): CriticalRequest {
  const num = (v: string) => parseNumber(v) as number;
  const geometry: CriticalRequest["geometry"] = { shape: s.shape };
  for (const d of DIMENSIONS[s.shape]) geometry[d] = num(s[d]);
  return {
    frequency_hz: num(s.freq),
    forcing: { kind: s.forcingKind, value: num(s.forcingValue), unit: s.forcingKind === "acceleration" ? "m/s^2" : "m" },
    fluid: { kinematic_viscosity_m2_s: num(s.nu), density_kg_m3: num(s.rho), surface_tension_n_m: num(s.sigma) },
    depth_m: num(s.depth),
    geometry,
    include_plot_data: true,
  };
}

/** Map API field paths (backend field_errors keys) to form fields. */
export function fieldFromApiPath(path: string, s: FormState): FieldKey | null {
  const map: Record<string, FieldKey> = {
    frequency_hz: "freq", depth_m: "depth",
    "fluid.kinematic_viscosity_m2_s": "nu", "fluid.density_kg_m3": "rho", "fluid.surface_tension_n_m": "sigma",
    forcing: "forcingValue", "forcing.value": "forcingValue",
    "geometry.L": "L", "geometry.Lx": "Lx", "geometry.Ly": "Ly", "geometry.R": "R",
  };
  if (path in map) return map[path];
  if (path === "geometry") return DIMENSIONS[s.shape][0] ?? null;
  return null;
}
