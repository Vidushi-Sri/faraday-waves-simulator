import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow,
} from "@carbon/react";
import type { ReactNode } from "react";
import type { CriticalResponse } from "../api/types";
import { modeLabel, responseWord, sig4 } from "../lib/text";

/** The solver's lowest modes (analyze()["modes"], sorted by threshold), as the
 *  CLI prints them. Numbers at 4 significant figures, right-aligned. */
export function ModesTable({ r }: { r: CriticalResponse }) {
  const modes = r.results.lowest_modes;
  const ref = r.results.unbounded_reference;
  const finite = r.model.geometry !== "infinite";
  return (
    <section className="panel-card" aria-labelledby="modes-h">
      <h3 id="modes-h" className="card-title">{finite ? "Lowest modes of the container" : "Thresholds at the critical wavenumber"}</h3>
      <p className="card-sub">
        {finite
          ? <>Ordered by onset threshold; the first row is the critical mode. Infinite-layer reference: a<sub>c</sub> = {sig4(ref.critical_acceleration_m_s2)} m/s², λ<sub>c</sub> = {sig4(ref.wavelength_mm)} mm.</>
          : <>Subharmonic and harmonic onset thresholds at the critical wavenumber k<sub>c</sub>; the lower one determines the response.</>}
      </p>
      <TableContainer className="modes-table">
        <Table size="sm" useZebraStyles={false} aria-label="Lowest modes">
          <TableHead>
            <TableRow>
              <Head name="Mode" />
              <Head num name="k" unit={<>mm<sup>−1</sup></>} />
              <Head num name="λ" unit="mm" />
              <Head num name={<>a<sub>c</sub>, subharmonic</>} unit={<>m/s<sup>2</sup></>} />
              <Head num name={<>a<sub>c</sub>, harmonic</>} unit={<>m/s<sup>2</sup></>} />
              <Head name="Response" />
              <Head name="At applied a" />
              <Head num name="Growth rate" unit={<>s<sup>−1</sup></>} />
            </TableRow>
          </TableHead>
          <TableBody>
            {modes.map((m, i) => (
              <TableRow key={m.label} className={i === 0 ? "is-critical" : undefined}>
                <TableCell>{m.label === "k_c" ? <>k<sub>c</sub></> : modeLabel(m.label)}</TableCell>
                <TableCell className="num">{sig4(m.wavenumber_per_mm)}</TableCell>
                <TableCell className="num">{sig4(m.wavelength_mm)}</TableCell>
                <TableCell className="num">{sig4(m.threshold_subharmonic_m_s2)}</TableCell>
                <TableCell className="num">{sig4(m.threshold_harmonic_m_s2)}</TableCell>
                <TableCell>{responseWord(m.response)}</TableCell>
                <TableCell><span className={`state state--${m.unstable ? "unstable" : "stable"}`}>{m.unstable ? "Unstable" : "Stable"}</span></TableCell>
                <TableCell className="num">{sig4(m.growth_rate_per_s)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {modes.some(m => m.growth_rate_per_s == null) && (
        <p className="card-foot">--: growth rate not available (not computed for a ≤ 0.5 a<sub>c</sub>, or withheld because it failed the solver self-check).</p>
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
        <span className="th__unit">{unit ?? "\u00a0"}</span>
      </span>
    </TableHeader>
  );
}
