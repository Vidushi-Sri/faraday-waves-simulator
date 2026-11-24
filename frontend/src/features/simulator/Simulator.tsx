import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button, ContentSwitcher, Dropdown, Header, HeaderGlobalAction, HeaderGlobalBar, HeaderName, HeaderPanel,
  InlineLoading, InlineNotification, Switch, TextInput,
} from "@carbon/react";
import { Cube, Information, Play, RainDrop, Renew, Reset, WavePeriod } from "@carbon/icons-react";
import { api, ApiFailure, CLIENT_TIMEOUT_MS } from "../../api/client";
import type { CriticalRequest, CriticalResponse } from "../../api/types";
import { VerdictHero } from "../../components/VerdictHero";
import { Logo, ProblemSchematic } from "../../components/Brand";
import { StabilityChart } from "../../components/StabilityChart";
import { PatternChart } from "../../components/PatternChart";
import { ModesTable } from "../../components/ModesTable";
import { RunParameters } from "../../components/RunParameters";
import { fmt, interpretation, provenanceLine, modeLabel, patternCaption, responseFreq, responseWord, stabilityCaption } from "../../lib/text";
import {
  DIMENSIONS, LABELS, REFERENCE, SHAPE_OPTIONS, buildRequest, fieldFromApiPath, forcingLabel, parseNumber, validate,
  type FieldKey, type FormState, type ShapeOption,
} from "../../lib/form";

/** A response always travels with the request that produced it. */
interface Solved { req: CriticalRequest; res: CriticalResponse }
type Health = { state: "checking" } | { state: "ok"; version: string; commit: string | null } | { state: "down" };

const DRAG_DEBOUNCE_MS = 250;

export default function Simulator() {
  const [s, setS] = useState<FormState>(REFERENCE);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [solved, setSolved] = useState<Solved | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragPending, setDragPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);            // seconds, while a run is in flight
  const timedOut = useRef(false);

  const errors = validate(s);
  const errorCount = Object.keys(errors).length;
  const fieldError = (k: FieldKey) => serverErrors[k] ?? ((submitted || touched.has(k)) ? errors[k] : undefined);

  const stateRef = useRef(s);
  stateRef.current = s;
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const dragTimer = useRef<number | undefined>(undefined);

  const checkHealth = useCallback(async () => {
    setHealth({ state: "checking" });
    try {
      const h = await api.health();
      setHealth({ state: "ok", version: h.api_version, commit: h.solver.repo_commit });
    } catch { setHealth({ state: "down" }); }
  }, []);
  useEffect(() => { checkHealth(); return () => { window.clearTimeout(dragTimer.current); abortRef.current?.abort(); }; }, [checkHealth]);

  const markStale = () => { if (solved) setStale(true); };
  const update = (k: FieldKey) => (v: string) => {
    setS(p => ({ ...p, [k]: v }));
    setServerErrors(e => { const n = { ...e }; delete n[k]; return n; });
    markStale();
  };

  async function solve(state: FormState, mode: "run" | "drag") {
    if (Object.keys(validate(state)).length) { setSubmitted(true); setDragPending(false); return; }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const id = ++seq.current;
    if (mode === "run") setLoading(true); else setDragPending(true);
    timedOut.current = false;
    const t0 = performance.now();
    setElapsed(0);
    const tick = window.setInterval(() => setElapsed(Math.floor((performance.now() - t0) / 1000)), 250);
    const limit = window.setTimeout(() => { timedOut.current = true; ac.abort(); }, CLIENT_TIMEOUT_MS);
    setError(null);
    const req = buildRequest(state);
    try {
      const res = await api.critical(req, ac.signal);
      if (id !== seq.current) return;
      setSolved({ req, res });
      setStale(false);
      setServerErrors({});
      if (health.state !== "ok") checkHealth();
    } catch (e) {
      if (id !== seq.current) return;
      if ((e as Error).name === "AbortError") {
        if (timedOut.current) setError(new ApiFailure(`The calculation did not finish within ${CLIENT_TIMEOUT_MS / 1000} s. Try again in a moment.`, "TIMEOUT"));
        return;
      }
      const f = e instanceof ApiFailure ? e : new ApiFailure(String(e), "UNKNOWN");
      setError(f);
      if (f.code === "UNREACHABLE") setHealth({ state: "down" });
      const mapped: Partial<Record<FieldKey, string>> = {};
      for (const [path, msg] of Object.entries(f.fieldErrors)) {
        const k = fieldFromApiPath(path, state);
        if (k) mapped[k] = msg;
      }
      setServerErrors(mapped);
      if (solved) setStale(true);                  // never present an old result as fresh
    } finally {
      window.clearInterval(tick);
      window.clearTimeout(limit);
      if (id === seq.current) { setLoading(false); setDragPending(false); }
    }
  }

  function cancel() {
    seq.current++;                       // ignore whatever comes back
    abortRef.current?.abort();
    setLoading(false); setDragPending(false);
  }

  function run() { setSubmitted(true); window.clearTimeout(dragTimer.current); solve(stateRef.current, "run"); }

  function resetToReference() {
    setS(REFERENCE); setTouched(new Set()); setSubmitted(false); setServerErrors({}); markStale();
  }

  // Dragging the applied line changes the INPUT only; the backend re-solves.
  const onAppliedChange = useCallback((a: number) => {
    const next = { ...stateRef.current, forcingValue: String(a) };
    stateRef.current = next;
    setS(next);
    setDragPending(true);
    window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => solve(next, "drag"), DRAG_DEBOUNCE_MS);
  }, []); // solve() only touches refs and state setters

  function setForcingKind(kind: FormState["forcingKind"]) {
    if (kind === s.forcingKind) return;
    // clear the value: 100 m/s² must never silently become 100 m
    setS(p => ({ ...p, forcingKind: kind, forcingValue: "" }));
    setTouched(t => new Set(t).add("forcingValue"));
    markStale();
  }

  const field = (k: FieldKey, label: string, helperText?: string) => (
    <TextInput key={k} id={k} size="sm" labelText={label} value={s[k]} inputMode="decimal" autoComplete="off"
      helperText={helperText} invalid={!!fieldError(k)} invalidText={fieldError(k)}
      onChange={e => update(k)(e.target.value)} onBlur={() => setTouched(t => new Set(t).add(k))} />
  );

  const res = solved?.res;
  const liveA = parseNumber(s.forcingValue);
  const accelInput = solved?.req.forcing.kind === "acceleration" && s.forcingKind === "acceleration";
  const appliedA = dragPending && accelInput && liveA != null && !Number.isNaN(liveA) && liveA >= 0
    ? liveA : res?.results.applied_acceleration_m_s2 ?? 0;
  const crit = res?.results.critical_mode;

  return (
    <div className="app">
      <Header aria-label="Faraday Waves Simulator">
        <HeaderName href="#" prefix=""><span className="brand"><Logo /><span className="brand__name">Faraday Waves Simulator</span></span></HeaderName>
        <HeaderGlobalBar>
          {/* users only need to know when something is wrong */}
          {health.state === "down" && (
            <span className="api-status api-status--down" role="status">
              <span className="api-status__dot" aria-hidden="true" />
              Simulator offline <button type="button" className="link-btn" onClick={checkHealth}>Retry</button>
            </span>
          )}
          <HeaderGlobalAction aria-label="About this tool" tooltipAlignment="end" isActive={aboutOpen}
            onClick={() => setAboutOpen(o => !o)}>
            <Information size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
        <HeaderPanel expanded={aboutOpen} aria-label="About this tool" className="about-panel">
          <h2 className="about-panel__title">About</h2>
          <p>Faraday waves are standing waves that form on the free surface of a vertically vibrated liquid once the forcing exceeds a threshold. This tool computes that threshold, the critical mode, its response type and its growth rate for flat-bottomed containers.</p>
          <h3>Method</h3>
          <p>Exact linear viscous Floquet analysis (K. Kumar, 1996, Proc. R. Soc. Lond. A 452, 1113), including viscosity, surface tension and finite depth. For the reference case it reproduces the published threshold of 91.19 m/s².</p>
          <h3>Containers</h3>
          <p>Infinite layer, two-dimensional channel, rectangular box and upright cylinder.</p>
          <h3>Scope</h3>
          <p>Linear theory predicts onset and early growth, not saturated amplitudes or pattern selection. Side walls are ideal, so thresholds for small containers are lower bounds.</p>
          <h3>Terms used here</h3>
          <dl className="about-panel__terms">
            <dt>Onset threshold a<sub>c</sub></dt><dd>The smallest vertical acceleration of the container at which the flat surface becomes unstable.</dd>
            <dt>Applied acceleration a</dt><dd>The peak vertical acceleration of the container, a cos 2πft.</dd>
            <dt>Wavenumber k</dt><dd>2π divided by the wavelength λ of a surface wave.</dd>
            <dt>Critical mode</dt><dd>The wave pattern that becomes unstable first, at a = a<sub>c</sub>.</dd>
            <dt>Subharmonic / harmonic</dt><dd>The surface oscillates at half the drive frequency (f/2) or at the drive frequency (f).</dd>
            <dt>Tongue</dt><dd>The region of (k, a) in which a given response grows; each curve on the stability chart is its lower boundary.</dd>
            <dt>Growth rate s</dt><dd>Disturbances grow like e<sup>st</sup>: positive s grows, negative s decays.</dd>
            <dt>Allowed mode</dt><dd>A wave pattern that fits the container walls; only these exist in a finite container.</dd>
          </dl>
          <h3>Reproducibility</h3>
          <p>Exported data (CSV) and figures (SVG, PNG) record all inputs and the model version.</p>
        </HeaderPanel>
      </Header>

      <div className="layout">
        <aside className="panel" aria-label="Simulation inputs">
          <form className="panel-scroll" noValidate onSubmit={e => { e.preventDefault(); run(); }} id="sim-form">
            <div className="panel-head">
              <h2 className="panel-title">Parameters</h2>
              <Button kind="ghost" size="sm" renderIcon={Reset} onClick={resetToReference}>Reference case</Button>
            </div>

            <fieldset className="group">
              <GroupTitle icon={<Cube size={16} />}>Container</GroupTitle>
              <Dropdown<ShapeOption>
                id="shape" size="sm" titleText="Geometry" label="Geometry" items={SHAPE_OPTIONS}
                itemToString={i => i?.label ?? ""}
                selectedItem={SHAPE_OPTIONS.find(o => o.id === s.shape)}
                onChange={({ selectedItem }) => {
                  if (!selectedItem) return;
                  const shape = selectedItem.id;
                  setS(p => ({ ...p, shape }));
                  setServerErrors({});
                  markStale();
                }}
              />
              {DIMENSIONS[s.shape].map(k => field(k, LABELS[k], k === "L" && s.L === REFERENCE.L ? "0.00401 m is the COMSOL validation channel." : undefined))}
              {field("depth", LABELS.depth)}
            </fieldset>

            <fieldset className="group">
              <GroupTitle icon={<RainDrop size={16} />}>Fluid</GroupTitle>
              {field("nu", LABELS.nu, "ν = μ / ρ. Water at 20 °C is about 1.0e-6.")}
              {field("rho", LABELS.rho)}
              {field("sigma", LABELS.sigma)}
            </fieldset>

            <fieldset className="group">
              <GroupTitle icon={<WavePeriod size={16} />}>Forcing</GroupTitle>
              {field("freq", LABELS.freq)}
              <div>
                <p className="cds--label" id="forcing-kind">Forcing input</p>
                <ContentSwitcher aria-labelledby="forcing-kind" size="sm"
                  selectedIndex={s.forcingKind === "acceleration" ? 0 : 1}
                  onChange={({ index }) => setForcingKind(index === 0 ? "acceleration" : "displacement")}>
                  <Switch name="acc" text="Acceleration" />
                  <Switch name="disp" text="Displacement" />
                </ContentSwitcher>
              </div>
              {field("forcingValue", forcingLabel(s.forcingKind),
                s.forcingKind === "displacement" ? "Converted on the server as a = (2πf)² d." : "Switching input type clears this value.")}
            </fieldset>
          </form>

          <div className="panel-foot">
            {submitted && errorCount > 0 && (
              <p className="form-summary" role="alert">
                Fix the {errorCount === 1 ? "highlighted field" : `${errorCount} highlighted fields`} before running.
              </p>
            )}
            {loading
              ? <div className="running" role="status">
                  <InlineLoading description={<>Calculating <span className="running__time">{elapsed} s</span></>} />
                  <Button kind="ghost" size="sm" onClick={cancel}>Cancel</Button>
                </div>
              : <Button type="submit" form="sim-form" kind="primary" className="run-btn" renderIcon={solved ? Renew : Play}
                  disabled={health.state === "down" && !solved}>
                  {solved ? "Run again" : "Run simulation"}
                </Button>}
          </div>
        </aside>

        <main className={`results${loading || dragPending ? " is-solving" : ""}`} aria-busy={loading || dragPending}>
          <header className="results-head">
            <h1 className="results-title">Results</h1>
            {res && <RunParameters r={res} />}
          </header>

          {error && (
            <InlineNotification kind="error" lowContrast className="notice"
              title={error.code === "UNREACHABLE" ? "Simulator offline" : error.code === "CALCULATION_FAILED" ? "Calculation failed" : error.code === "TIMEOUT" ? "Calculation timed out" : error.code === "OUT_OF_RANGE" ? "Outside the range of the model" : error.code === "CONTAINER_TOO_LARGE" ? "Container too large" : "Could not run"}
              subtitle={`${error.message}${error.errorId ? ` Error ID ${error.errorId}.` : ""}`}
              onCloseButtonClick={() => setError(null)} />
          )}

          {!solved && !error && (
            <section className="empty" aria-labelledby="empty-h">
              <ProblemSchematic />
              <div className="empty__text">
                <h2 id="empty-h" className="empty__title">Onset of Faraday waves</h2>
                <p>Specify the container, fluid and forcing, then run the calculation. The tool returns the onset threshold, the critical mode with its response type and growth rate, the stability diagram and the onset pattern.</p>
                <Button kind="primary" renderIcon={Play} onClick={run} disabled={loading}>Run reference case</Button>
                <p className="empty__note">Parameters are preset to the reference case of Kumar (1996): 60 Hz drive, 2.9 mm depth. Published onset threshold: 91.19 m/s².</p>
              </div>
            </section>
          )}

          {solved && res && (
            <>
              {stale && !dragPending && (
                <p className="stale-note" role="status">
                  <Information size={16} aria-hidden="true" />
                  Parameters have changed. Run again to update the results.
                </p>
              )}

              <VerdictHero r={res} updating={dragPending} />

              <div className={`stats stats--${crit && res.model.geometry !== "infinite" ? 4 : 3}`} role="list">
                <Stat label={<>Critical wavelength λ<sub>c</sub></>} value={fmt(crit?.wavelength_mm)} unit="mm"
                  meta={crit ? `k = ${fmt(crit.wavenumber_per_mm, 4)} mm⁻¹` : "not available"} />
                {crit && res.model.geometry !== "infinite" && (
                  <Stat label="Critical mode" value={modeLabel(crit.label)} unit="" meta={res.model.container} />
                )}
                <Stat label="Response" value={crit ? responseWord(crit.response) : "--"} unit=""
                  meta={crit ? (crit.response === "subharmonic" ? `Oscillates at ${responseFreq(crit.response)}, half the drive frequency` : `Oscillates at ${responseFreq(crit.response)}, the drive frequency`) : ""} />
                <Stat label="Growth rate s" value={crit?.growth_rate_per_s == null ? "--" : `${crit.growth_rate_per_s > 0 ? "+" : ""}${fmt(crit.growth_rate_per_s)}`}
                  unit={crit?.growth_rate_per_s == null ? "" : "s⁻¹"}
                  meta={crit?.growth_rate_per_s == null ? ((res.results.ratio_applied_to_critical ?? 0) <= 0.5 ? "Computed only for a > 0.5 a_c" : "Withheld: failed the self-check") : crit.growth_rate_per_s > 0 ? "Disturbances grow" : "Disturbances decay"}
                  tone={crit?.growth_rate_per_s == null ? undefined : res.results.status} />
              </div>

              {res.plots && (
                <div className="charts">
                  <section className="chart" aria-labelledby="stab-h">
                    <h3 id="stab-h" className="card-title">Stability chart</h3>
                    <p className="card-sub">{stabilityCaption(res)}{accelInput ? " Drag the line to recalculate." : ""}</p>
                    <StabilityChart r={res} appliedA={appliedA} pending={dragPending} draggable={accelInput} onAppliedChange={onAppliedChange} />
                  </section>
                  <section className="chart" aria-labelledby="pat-h">
                    <h3 id="pat-h" className="card-title">Onset pattern</h3>
                    <p className="card-sub">{patternCaption(res)}</p>
                    <PatternChart r={res} />
                  </section>
                </div>
              )}

              <ModesTable r={res} />

              <section className="notes">
                <div className="notes__main">
                  <h3 className="card-title">Interpretation</h3>
                  <p className="notes__body">{interpretation(res)}</p>
                  {res.warnings.length > 0 && (
                    <>
                      <h4 className="notes__sub">Notes</h4>
                      <ul className="notes__list">{res.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                    </>
                  )}
                </div>
                <div className="notes__side">
                  <h3 className="card-title">Assumptions</h3>
                  <ul className="notes__list">{res.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
              </section>

              <footer className="about-result">
                <p>{provenanceLine(res.provenance)}</p>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function GroupTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <legend className="group-title"><span className="group-title__icon" aria-hidden="true">{icon}</span>{children}</legend>;
}

function Stat({ label, value, unit, meta, tone }: {
  label: ReactNode; value: string; unit: string; meta: string; tone?: CriticalResponse["results"]["status"];
}) {
  return (
    <div className="stat" role="listitem">
      <div className="stat__label">{label}</div>
      <div className={`stat__value${tone ? ` stat__value--${tone}` : ""}`}>
        {value}{unit && <span className="stat__unit">{unit}</span>}
      </div>
      <div className="stat__meta">{meta}</div>
    </div>
  );
}
