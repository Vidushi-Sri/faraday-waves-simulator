import { InlineLoading } from "@carbon/react";
import type { CriticalResponse } from "../api/types";
import { fmt, ratioLabel, statusOutcome, statusShort, verdictConsequence } from "../lib/text";

/**
 * The answer, read in under five seconds:
 *   1. verdict word in the status colour (the only large coloured type), with
 *      what it means in plain words underneath
 *   2. onset threshold vs applied acceleration, same size so they compare
 *   3. a bar placing applied a against the threshold, with the margin in words
 * Everything comes from the response (applied a is the backend's value, which
 * is derived server-side when the input was a displacement).
 */
export function VerdictHero({ r, updating }: { r: CriticalResponse; updating?: boolean }) {
  const res = r.results;
  const ac = res.critical_acceleration_m_s2;
  const applied = res.applied_acceleration_m_s2;
  const max = Math.max(ac ?? 0, applied) * 1.25 || 1;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

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
          <div className="meter">
            <div className="meter__track" aria-hidden="true">
              <div className="meter__fill" style={{ width: pct(applied) }} />
              <div className="meter__tick" style={{ left: pct(ac) }} />
            </div>
            <div className="meter__legend">
              <span className="meter__ratio">{ratioLabel(r)}</span>
              <span className="meter__key" aria-hidden="true"><span className="meter__tick-key" /><span>a<sub>c</sub></span></span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
