import type { ReactNode } from "react";
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow,
} from "@carbon/react";
import type { CriticalResponse } from "../api/types";
import { modeLabel, responseWord, sig4 } from "../lib/text";
import { RESPONSE_COLOR } from "../lib/colors";

/**
 * Mode details, in the form that fits the data:
 *  - infinite layer: one wavenumber, two thresholds -> a two-bar comparison
 *    (subharmonic vs harmonic) on a common scale; the lower one sets the response.
 *  - finite container: up to 10 allowed modes -> a compact table, lowest
 *    threshold first (analyze()["modes"], as the solver CLI prints them).
 * All values are the solver's, shown at 4 significant figures.
 */
export function ModesTable({ r }: { r: CriticalResponse }) {
  return r.model.geometry === "infinite" ? <ThresholdComparison r={r} /> : <LowestModes r={r} />;
}

function ThresholdComparison({ r }: { r: CriticalResponse }) {
  const m = r.results.critical_mode;
  if (!m) return null;
  const rows = [
    { key: "subharmonic" as const, name: "Subharmonic", freq: "f/2", a: m.threshold_subharmonic_m_s2 },
    { key: "harmonic" as const, name: "Harmonic", freq: "f", a: m.threshold_harmonic_m_s2 },
  ];
  const max = Math.max(...rows.map(x => x.a ?? 0)) || 1;
  const lower = rows.reduce((p, q) => ((q.a ?? Infinity) < (p.a ?? Infinity) ? q : p));
  return (
    <section className="panel-card" aria-labelledby="modes-h">
      <h3 id="modes-h" className="card-title">Thresholds at the critical wavenumber</h3>
      <p className="card-sub">
        At k<sub>c</sub> = {sig4(m.wavenumber_per_mm)} mm<sup>−1</sup> (λ<sub>c</sub> = {sig4(m.wavelength_mm)} mm), the onset
        threshold of each response type. The lower one determines how the surface responds.
      </p>
      <dl className="compare">
        {rows.map(x => (
          <div key={x.key} className={`compare__row${x === lower ? " is-lower" : ""}`}>
            <dt className="compare__label">
              <span className="compare__swatch" style={{ background: RESPONSE_COLOR[x.key] }} aria-hidden="true" />
              {x.name} <span className="compare__freq">({x.freq})</span>
            </dt>
            <dd className="compare__bar" aria-hidden="true">
              <span style={{ width: `${((x.a ?? 0) / max) * 100}%`, background: RESPONSE_COLOR[x.key] }} />
            </dd>
            <dd className="compare__value">{sig4(x.a)}<span className="compare__unit">m/s²</span></dd>
            <dd className="compare__note">{x === lower ? "Lower: sets the response" : `${sig4((x.a ?? 0) / (lower.a ?? 1))} × higher`}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LowestModes({ r }: { r: CriticalResponse }) {
  const modes = r.results.lowest_modes;
  const ref = r.results.unbounded_reference;
  return (
    <section className="panel-card" aria-labelledby="modes-h">
      <h3 id="modes-h" className="card-title">Lowest modes of the container</h3>
      <p className="card-sub">
        Ordered by onset threshold; the first row is the critical mode. For comparison, an infinite layer has
        a<sub>c</sub> = {sig4(ref.critical_acceleration_m_s2)} m/s² at λ<sub>c</sub> = {sig4(ref.wavelength_mm)} mm.
      </p>
      <TableContainer className="modes-table">
        <Table size="sm" useZebraStyles={false} aria-label="Lowest modes of the container">
          <TableHead>
            <TableRow>
              <Head name="Mode" />
              <Head num name="k" unit={<>mm<sup>−1</sup></>} />
              <Head num name="λ" unit="mm" />
              <Head num name={<>a<sub>c</sub></>} unit={<>m/s<sup>2</sup></>} />
              <Head name="Response" />
              <Head name="At applied a" />
              <Head num name="Growth rate" unit={<>s<sup>−1</sup></>} />
            </TableRow>
          </TableHead>
          <TableBody>
            {modes.map((m, i) => (
              <TableRow key={m.label} className={i === 0 ? "is-critical" : undefined}>
                <TableCell>{modeLabel(m.label)}</TableCell>
                <TableCell className="num">{sig4(m.wavenumber_per_mm)}</TableCell>
                <TableCell className="num">{sig4(m.wavelength_mm)}</TableCell>
                <TableCell className="num">{sig4(m.critical_acceleration_m_s2)}</TableCell>
                <TableCell>{responseWord(m.response)} ({m.response === "subharmonic" ? "f/2" : "f"})</TableCell>
                <TableCell><span className={`state state--${m.unstable ? "unstable" : "stable"}`}>{m.unstable ? "Grows (unstable)" : "Decays (stable)"}</span></TableCell>
                <TableCell className="num">{sig4(m.growth_rate_per_s)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {modes.some(m => m.growth_rate_per_s == null) && (
        <p className="card-foot">A dash means no growth rate is shown: it is not computed for a ≤ 0.5 a<sub>c</sub> or a &gt; 5 a<sub>c</sub>, or it failed the self-check.</p>
      )}
    </section>
  );
}

/** Uniform two-line header: name on the first line, unit (or a blank line) on
 *  the second, so every column header has the same height and baseline. */
function Head({ name, unit, num }: { name: ReactNode; unit?: ReactNode; num?: boolean }) {
  return (
    <TableHeader className={num ? "num" : undefined}>
      <span className="th">
        <span className="th__name">{name}</span>
        <span className="th__unit">{unit ?? " "}</span>
      </span>
    </TableHeader>
  );
}
