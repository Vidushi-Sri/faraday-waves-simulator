import { InlineLoading } from "@carbon/react";
import type { CriticalResponse } from "../api/types";
import { fmt, ratioLabel, statusOutcome, statusShort, verdictConsequence } from "../lib/text";

/**
 * The answer, read in under five seconds:
 *   1. the verdict (Stable / Unstable) in plain type, with what it means underneath
 *   2. onset threshold vs applied acceleration, same size so they compare
 *   3. the regime line: the surface drawn flat below a_c and as a wave above it,
 *      with the applied a marked on it, so "where waves form" is a picture
 * Neither outcome is styled as an alarm or a success: waves are often the goal.
 * Everything comes from the response (applied a is the backend's value, which
 * is derived server-side when the input was a displacement).
 */
export function VerdictHero({ r, updating }: { r: CriticalResponse; updating?: boolean }) {
  const res = r.results;
  const ac = res.critical_acceleration_m_s2;
  const applied = res.applied_acceleration_m_s2;
  const max = Math.max(ac ?? 0, applied) * 1.25 || 1;
  const frac = (v: number) => Math.min(100, (v / max) * 100);
  const pct = (v: number) => `${frac(v)}%`;

  return (
    <section className={`hero st--${res.status}`} aria-labelledby="verdict-title">
      <div className="hero__verdict" role="status" aria-live="polite" aria-busy={updating || undefined}>
        <h2 id="verdict-title" className="hero__title">{statusShort(r)}</h2>
        {statusOutcome(r) && (
          <p className="hero__outcome">
            {statusOutcome(r)}
            <span className="hero__rule">{res.status === "unstable" ? <>a &gt; a<sub>c</sub></> : <>a ≤ a<sub>c</sub></>}</span>
          </p>
        )}
        <p className="hero__explain">{verdictConsequence(r)}</p>
        {updating && <InlineLoading className="hero__updating" description="Updating" />}
      </div>

      <div className="hero__numbers">
        <div className="hero__num">
          <span className="hero__label">Onset threshold a<sub>c</sub></span>
          <span className="hero__value">{fmt(ac)}<span className="hero__unit">m/s²</span></span>
        </div>
        <div className="hero__num">
          <span className="hero__label">Applied acceleration a</span>
          <span className="hero__value">{fmt(applied)}<span className="hero__unit">m/s²</span></span>
        </div>
        {ac != null && (
          <figure className="regime" aria-label={`Applied acceleration ${ratioLabel(r)}`}>
            <div className="regime__track" aria-hidden="true">
              <div className="regime__flat" style={{ width: pct(ac) }} />
              <div className="regime__waves" style={{ left: pct(ac) }} />
              <div className="regime__ac" style={{ left: pct(ac) }} />
              <div className="regime__a" style={{ left: pct(applied) }}>
                <span className="regime__a-label">a</span>
              </div>
            </div>
            <div className="regime__labels" aria-hidden="true">
              {frac(ac) > 22 && <span className="regime__lab-flat">flat surface</span>}
              <span className="regime__lab-ac" style={{ left: pct(ac) }}>a<sub>c</sub></span>
              <span className="regime__lab-waves">Faraday waves</span>
            </div>
            <figcaption className="regime__ratio">Applied a is {ratioLabel(r)}.</figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}
