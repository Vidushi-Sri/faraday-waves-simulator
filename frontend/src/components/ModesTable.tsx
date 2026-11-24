import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow,
} from "@carbon/react";
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
              <TableHeader>Mode</TableHeader>
              <TableHeader className="num">k (mm⁻¹)</TableHeader>
              <TableHeader className="num">λ (mm)</TableHeader>
              <TableHeader className="num">a<sub>c</sub> at f/2 (m/s²)</TableHeader>
              <TableHeader className="num">a<sub>c</sub> at f (m/s²)</TableHeader>
              <TableHeader>Response</TableHeader>
              <TableHeader>At applied a</TableHeader>
              <TableHeader className="num">Growth rate (s⁻¹)</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {modes.map((m, i) => (
              <TableRow key={m.label} className={i === 0 ? "is-critical" : undefined}>
                <TableCell>{modeLabel(m.label)}</TableCell>
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
