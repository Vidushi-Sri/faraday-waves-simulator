# Frontend: Faraday Waves Simulator

React + TypeScript + Vite, IBM Carbon. All physics comes from the backend
(`../backend`), which calls `faraday_floquet.py`. The browser never computes
or converts a physical quantity; it validates input, sends it in SI units and
displays the response.

## Run

```powershell
npm install
npm run dev          # http://localhost:5173 (proxies /api to http://localhost:8000)
npm run build        # strict type check + production bundle
```

The API base URL comes from `VITE_API_BASE_URL` (see `.env.example`); the
default `/api/v1` uses the dev proxy.

## Structure

```
src/
  api/          types.ts (mirror of backend/app/schemas.py), client.ts (the only fetch)
  lib/          form.ts (fields, validation, request), text.ts (all wording, templated
                from the response), plot.ts (scientific axes, legend, export),
                axes.ts (zoom, pan, data tips, PNG), colors.ts (one colour system)
  components/   VerdictHero, StabilityChart, PatternChart, ModesTable, RunParameters,
                ChartTools (toolbar, tooltip), Brand (logo, schematic)
  features/simulator/Simulator.tsx   the screen and its state
  styles/app.scss                    Carbon g10 + IBM DESIGN.md conventions
```

## Design rules

- IBM Carbon, following IBM's DESIGN.md: 0 px corners, no shadows, 1 px
  hairlines, Plex Sans with 0.16 px body tracking, IBM Blue as the only
  interface accent; red / green reserved for unstable / stable.
- Charts follow scientific-figure conventions: boxed axes, inward major and
  minor ticks, units in axis titles, legend inside the figure (exported with
  it), data cursor that snaps to computed points, MATLAB-style toolbar
  (data tips, pan, zoom in/out, restore view, export PNG/SVG/CSV).
- Chart colours are validated for colour-vision deficiency (purple #6929c4,
  teal #009d9a). Labels use ink colours, never the series colour.
- Wording is plain and formal; every sentence about a result is templated
  from the response (`lib/text.ts`), so the text cannot contradict the solver.
