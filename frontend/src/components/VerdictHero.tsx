import { CheckmarkFilled, CircleDash, WarningFilled } from "@carbon/icons-react";
import { InlineLoading } from "@carbon/react";
import type { CriticalResponse } from "../api/types";
import { fmt, ratioLabel, statusShort, verdictConsequence } from "../lib/text";

/**
 * The answer, read in under five seconds:
 *   1. verdict word + icon in the status colour (the only large coloured type)
 *   2. onset threshold vs applied acceleration, same size so they compare
 *   3. a bar placing applied a against the threshold, with the margin in words
 * Everything comes from the response (applied a is the backend's value, which
 * is derived server-side when the input was a displacement).
 */
const ICONS = { unstable: WarningFilled, stable: CheckmarkFilled, no_critical_mode_found: CircleDash } as const;

export function VerdictHero({ r, updating }: { r: CriticalResponse; updating?: boolean }) {
  const res = r.results;
  const Icon = ICONS[res.status];
  const ac = res.critical_acceleration_m_s2;
  const applied = res.applied_acceleration_m_s2;
  const max = Math.max(ac ?? 0, applied) * 1.25 || 1;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <section className={`hero st--${res.status}`} aria-labelledby="verdict-title">
      <div className="hero__verdict" role="status" aria-live="polite" aria-busy={updating || undefined}>
        <div className="hero__status">
          <Icon size={32} className="hero__icon" aria-hidden="true" />
          <h2 id="verdict-title" className="hero__title">{statusShort(r)}</h2>
        </div>
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
