// Mirror of backend/app/schemas.py (API v1). Hand-written for now; generate
// from /openapi.json with openapi-typescript once the contract is frozen.

export type Shape = "infinite" | "channel" | "box" | "cylinder";
export type ForcingKind = "acceleration" | "displacement";
export type Response = "subharmonic" | "harmonic";

export interface CriticalRequest {
  frequency_hz: number;
  forcing: { kind: ForcingKind; value: number; unit: "m/s^2" | "m" };
  fluid: { kinematic_viscosity_m2_s: number; density_kg_m3: number; surface_tension_n_m: number };
  depth_m: number;
  geometry: { shape: Shape; L?: number; Lx?: number; Ly?: number; R?: number };
  include_plot_data: boolean;
}

export interface Mode {
  label: string;
  wavenumber_per_m: number;
  wavenumber_per_mm: number;
  wavelength_mm: number;
  threshold_subharmonic_m_s2: number | null;
  threshold_harmonic_m_s2: number | null;
  critical_acceleration_m_s2: number | null;
  response: Response;
  unstable: boolean;
  growth_rate_per_s: number | null;
}

export type Status = "unstable" | "stable" | "no_critical_mode_found";

export interface Results {
  status: Status;
  applied_acceleration_m_s2: number;
  critical_acceleration_m_s2: number | null;
  ratio_applied_to_critical: number | null;
  critical_mode: Mode | null;
  fastest_unstable_mode: Mode | null;
  lowest_modes: Mode[];
  unbounded_reference: {
    wavenumber_per_m: number; wavenumber_per_mm: number; wavelength_mm: number; critical_acceleration_m_s2: number;
  };
}

export interface CurvePoint { wavenumber_per_mm: number; wavelength_mm: number; a_m_s2: number | null }
export interface TongueMinimum { order: number; response_frequency: string; wavenumber_per_mm: number; a_m_s2: number }
export interface Curve { response: Response; points: CurvePoint[]; minima: TongueMinimum[] }
export interface AllowedMode {
  label: string; wavenumber_per_mm: number; critical_acceleration_m_s2: number; response: Response; unstable: boolean;
}
export interface Pattern {
  kind: "line" | "field";
  x_mm: number[];
  y_mm: number[] | null;
  values: number[] | (number | null)[][];
}
export interface Plots {
  tongues: Curve[];
  plot_range: { wavenumber_min_per_mm: number; wavenumber_max_per_mm: number; a_max_m_s2: number };
  allowed_modes: AllowedMode[];
  pattern: Pattern | null;
}

export interface Provenance {
  module: string; method: string; reference: string; fourier_truncation_N: number; gravity_m_s2: number;
  repo_commit: string | null; solver_sha256: string; computed: boolean; computed_at: string; input_fingerprint: string;
}

export interface CriticalResponse {
  status: "success";
  model: { phase: string; method: string; geometry: Shape; container: string };
  inputs: Omit<CriticalRequest, "include_plot_data"> & { applied_acceleration_m_s2: number };
  results: Results;
  plots: Plots | null;
  assumptions: string[];
  warnings: string[];
  provenance: Provenance;
}

export interface ApiError {
  status: "error";
  code: string;
  message: string;
  field_errors?: Record<string, string>;
  error_id?: string;
}
