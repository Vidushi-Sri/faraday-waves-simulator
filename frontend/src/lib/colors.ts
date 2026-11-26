// ONE colour system for the whole app. Mirrors the CSS variables in app.scss.
//
// Stable and unstable are outcomes, not good/bad: Faraday waves are often the
// goal of the experiment. So they are not red/green (Carbon keeps red for
// failures that need attention):
//   unstable -> IBM Blue  waves form (the wave line of the logo)
//   stable   -> gray      the surface stays flat
//   no_critical_mode_found -> gray (no claim either way)
// Colour is never the only cue: every state also has a pictogram and a word.
//
// Data colours (response types) are categorical and deliberately NOT red or
// green, so a "type" is never misread as a "status". They match the solver's
// own plot_tongues colours in hue family: subharmonic solid, harmonic dashed.
export const STATUS_TEXT = { unstable: "#0f62fe", stable: "#393939", no_critical_mode_found: "#525252", pending: "#525252" } as const;
export const STATUS_FILL = { unstable: "#0f62fe", stable: "#8d8d8d", no_critical_mode_found: "#8d8d8d", pending: "#8d8d8d" } as const;

export const RESPONSE_COLOR = {
  subharmonic: "#6929c4", // Carbon purple 70
  harmonic: "#009d9a",    // Carbon teal 50 (teal 60 failed the chroma floor: read as gray)
} as const;

/** Unstable set on the stability chart: one neutral tint (Carbon gray 20). */
export const UNSTABLE_FILL = "#e0e0e0";

/** Diverging scale for surface elevation (blue down, red up), as the solver's RdBu_r. */
export const ELEVATION_SCHEME = (t: number) => {
  // t in [-1, 1] -> Carbon-ish blue/white/red
  const c = Math.max(-1, Math.min(1, t));
  const mix = (a: number[], b: number[], u: number) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const white = [255, 255, 255], red = [218, 30, 40], blue = [0, 67, 206];
  const [r, g, b] = c >= 0 ? mix(white, red, c) : mix(white, blue, -c);
  return `rgb(${r},${g},${b})`;
};
