/* Brand mark, drawn like the Carbon icons used across the app (32-unit grid,
 * 2-unit single-colour strokes, no fill) and like the schematic on the start
 * screen. It is a real result: the critical mode of a 12 mm channel holding the
 * reference fluid (60 Hz, h = 2.9 mm) is m = 3, a_c = 91.20 m/s^2, so the surface
 * is eta(x) = cos(3 pi x / L): three half-wavelengths, meeting the inner face of
 * each wall with zero slope (free-slip wall condition), shown at two instants
 * half a period apart (solid and dashed). public/favicon.svg matches. */
const MARK_WALLS = "M5 6V27H27V6";
const MARK_SURFACE = "M6.00 13.00L6.56 13.10L7.11 13.40L7.67 13.88L8.22 14.50L8.78 15.22L9.33 16.00L9.89 16.78L10.44 17.50L11.00 18.12L11.56 18.60L12.11 18.90L12.67 19.00L13.22 18.90L13.78 18.60L14.33 18.12L14.89 17.50L15.44 16.78L16.00 16.00L16.56 15.22L17.11 14.50L17.67 13.88L18.22 13.40L18.78 13.10L19.33 13.00L19.89 13.10L20.44 13.40L21.00 13.88L21.56 14.50L22.11 15.22L22.67 16.00L23.22 16.78L23.78 17.50L24.33 18.12L24.89 18.60L25.44 18.90L26.00 19.00";
/** The same standing wave half a period later (as in the start-screen schematic). */
const MARK_SURFACE_LATER = "M6.00 19.00L6.56 18.90L7.11 18.60L7.67 18.12L8.22 17.50L8.78 16.78L9.33 16.00L9.89 15.22L10.44 14.50L11.00 13.88L11.56 13.40L12.11 13.10L12.67 13.00L13.22 13.10L13.78 13.40L14.33 13.88L14.89 14.50L15.44 15.22L16.00 16.00L16.56 16.78L17.11 17.50L17.67 18.12L18.22 18.60L18.78 18.90L19.33 19.00L19.89 18.90L20.44 18.60L21.00 18.12L21.56 17.50L22.11 16.78L22.67 16.00L23.22 15.22L23.78 14.50L24.33 13.88L24.89 13.40L25.44 13.10L26.00 13.00";

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo"
      fill="none" stroke="#0f62fe" strokeWidth="2">
      <path d={MARK_WALLS} strokeLinecap="square" />
      <path d={MARK_SURFACE_LATER} strokeWidth="1.3" strokeDasharray="2 1.6" opacity="0.75" />
      <path d={MARK_SURFACE} strokeLinejoin="round" />
    </svg>
  );
}

/* Geometry of the schematic (px). The surface is drawn from the actual mode
 * shape the solver uses for a channel with free-slip walls,
 *   eta(x) = A cos(m pi x / L),  m = 3  (one and a half wavelengths),
 * so it meets both walls with zero slope (antinodes), as the boundary
 * condition requires. Solid and dashed curves are the same standing wave half
 * a period apart. h is measured from the floor to the undisturbed (mean) surface. */
const X0 = 60, X1 = 240, FLOOR = 110, MEAN = 68, AMP = 13, M = 3;
const surface = (sign: 1 | -1, n = 72) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const x = X0 + ((X1 - X0) * i) / n;
    const y = MEAN - sign * AMP * Math.cos((M * Math.PI * (x - X0)) / (X1 - X0));
    return `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join("");
const CREST_X = X0 + (2 * (X1 - X0)) / 3; // cos(3 pi x/L) = 1 at x = 2L/3: an interior crest of the solid curve

/**
 * Labelled schematic of the problem (first screen). Every label maps to an
 * input or output of the tool: drive a cos 2 pi f t (plate), depth h, and the
 * subharmonic standing wave at f/2 that forms above the onset threshold.
 */
export function ProblemSchematic() {
  const ink = "#161616", muted = "#525252", blue = "#0f62fe";
  const font = { fontFamily: "'IBM Plex Sans', Arial, sans-serif", fontSize: 12, fill: muted } as const;
  const solid = surface(1), dashed = surface(-1);
  return (
    <svg width="410" height="156" viewBox="0 0 410 156" role="img" className="schematic"
      aria-label="A liquid layer of depth h in a container on a plate vibrated with acceleration a cos 2 pi f t. Above the onset threshold the surface forms a standing wave oscillating at f over 2.">
      {/* liquid, bounded by the solid surface */}
      <path d={`${solid}L${X1} ${FLOOR}L${X0} ${FLOOR}Z`} fill="#edf5ff" />
      {/* undisturbed (mean) surface: the reference for h */}
      <path d={`M${X0} ${MEAN}H${X1}`} stroke="#c6c6c6" strokeWidth="0.75" strokeDasharray="1 3" />
      {/* standing wave at two instants half a period apart */}
      <path d={solid} fill="none" stroke={blue} strokeWidth="1.5" />
      <path d={dashed} fill="none" stroke={blue} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      {/* container walls and floor */}
      <path d={`M${X0} 30V${FLOOR}H${X1}V30`} fill="none" stroke={ink} strokeWidth="1.5" />
      {/* label: response, leader ends on a crest */}
      <path d={`M${CREST_X + 2} ${MEAN - AMP - 2}L${CREST_X + 40} 22H${CREST_X + 54}`} fill="none" stroke={muted} strokeWidth="0.75" />
      <text x={CREST_X + 58} y="26" {...font}>standing wave, frequency f/2</text>
      {/* depth h: floor to mean surface */}
      <path d={`M${X1 + 14} ${MEAN}V${FLOOR}M${X1 + 10} ${MEAN}H${X1 + 18}M${X1 + 10} ${FLOOR}H${X1 + 18}`} stroke={muted} strokeWidth="0.75" />
      <text x={X1 + 24} y={(MEAN + FLOOR) / 2 + 4} {...font} fontStyle="italic">h</text>
      {/* vibrated plate and its drive */}
      <rect x={X0 - 16} y={FLOOR + 4} width={X1 - X0 + 32} height="4" fill={ink} />
      <path d={`M30 ${FLOOR - 6}V${FLOOR + 18}M26 ${FLOOR - 2}L30 ${FLOOR - 6}L34 ${FLOOR - 2}M26 ${FLOOR + 14}L30 ${FLOOR + 18}L34 ${FLOOR + 14}`}
        fill="none" stroke={muted} strokeWidth="1" />
      <text x={X0 - 16} y={FLOOR + 30} {...font}>plate acceleration a cos 2πft</text>
    </svg>
  );
}
