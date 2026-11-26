/* Brand mark: side view of a real result. The critical mode of a 12 mm channel
 * holding the reference fluid (60 Hz, h = 2.9 mm) is m = 3, a_c = 91.20 m/s^2:
 * eta(x) = cos(3 pi x / L), three half-wavelengths across the channel, meeting
 * both walls with zero slope as the free-slip wall condition requires. The
 * surface stays inside the walls. Amplitude is drawn large for legibility
 * (linear theory fixes the shape, not the height). public/favicon.svg matches. */
const MARK_SURFACE = "M3.50 7.60L3.86 7.67L4.22 7.89L4.58 8.24L4.94 8.70L5.31 9.23L5.67 9.80L6.03 10.37L6.39 10.90L6.75 11.36L7.11 11.71L7.47 11.93L7.83 12.00L8.19 11.93L8.56 11.71L8.92 11.36L9.28 10.90L9.64 10.37L10.00 9.80L10.36 9.23L10.72 8.70L11.08 8.24L11.44 7.89L11.81 7.67L12.17 7.60L12.53 7.67L12.89 7.89L13.25 8.24L13.61 8.70L13.97 9.23L14.33 9.80L14.69 10.37L15.06 10.90L15.42 11.36L15.78 11.71L16.14 11.93L16.50 12.00";
const MARK_LIQUID = "M3.50 7.60L3.86 7.67L4.22 7.89L4.58 8.24L4.94 8.70L5.31 9.23L5.67 9.80L6.03 10.37L6.39 10.90L6.75 11.36L7.11 11.71L7.47 11.93L7.83 12.00L8.19 11.93L8.56 11.71L8.92 11.36L9.28 10.90L9.64 10.37L10.00 9.80L10.36 9.23L10.72 8.70L11.08 8.24L11.44 7.89L11.81 7.67L12.17 7.60L12.53 7.67L12.89 7.89L13.25 8.24L13.61 8.70L13.97 9.23L14.33 9.80L14.69 10.37L15.06 10.90L15.42 11.36L15.78 11.71L16.14 11.93L16.50 12.00L16.5 16.5L3.5 16.5Z";
const MARK_WALLS = "M2.75 3V17.25H17.25V3";

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="logo">
      <path d={MARK_LIQUID} fill="#0f62fe" />
      <path d={MARK_SURFACE} fill="none" stroke="#0043ce" strokeWidth="1.4" strokeLinejoin="round" />
      <path d={MARK_WALLS} fill="none" stroke="#161616" strokeWidth="1.5" strokeLinecap="square" />
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
