# Backend: Phase 1 web API

A thin FastAPI layer over the existing solver in `../faraday_floquet.py`.
The research code is imported as-is (not moved, not edited). No physics lives here.

```
backend/
  app/
    main.py               routes, CORS, structured errors, timeout
    schemas.py            request/response models (the API contract)
    solver_bridge.py      imports faraday_floquet from the repo root, records provenance
    services/
      phase1_service.py   validates a run, calls the solver, normalises results
  tests/                  reference-case regression + contract/error tests
```

## Run

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
python -m pytest -q
```

Environment variables (optional):

| Variable           | Default                                         | Meaning                        |
| ------------------ | ----------------------------------------------- | ------------------------------ |
| `FRONTEND_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173`   | exact CORS origins, comma list |
| `SOLVE_TIMEOUT_S`  | `60`                                            | per-request solver time limit  |

## Endpoints

| Method | Route                       | Purpose                                               |
| ------ | --------------------------- | ----------------------------------------------------- |
| GET    | `/api/v1/health`            | status, API version, solver commit + file hash        |
| GET    | `/api/v1/capabilities`      | shapes, required dimensions, forcing kinds, units     |
| POST   | `/api/v1/phase1/critical`   | one Phase 1 run (`include_plot_data` for chart data)  |

## How results map to the solver

| Response field                         | Solver source                                             |
| -------------------------------------- | --------------------------------------------------------- |
| `results.critical_mode`                | `analyze(...)["first"]`                                   |
| `results.lowest_modes`                 | `analyze(...)["modes"]` (n_report = 10)                   |
| `results.fastest_unstable_mode`        | max growth rate over `analyze(...)["unstable"]` (as CLI)  |
| `results.unbounded_reference`          | `analyze(...)["kc_inf"]`, `["ac_inf"]`                    |
| `plots.tongues`                        | `threshold(k, f, fl, 0.5 / 0.0)` over `plot_tongues`' k range (0.15 to 3 k_c) |
| `plots.allowed_modes`                  | `container.modes(3 k_c)` + `threshold` (as `plot_tongues`) |
| `plots.pattern`                        | `container.pattern(...)` on `plot_mode`'s grid            |
| displacement input                     | `a = (2 pi f)^2 d`, the CLI's own conversion              |

Guardrails: exact-one forcing kind with matching unit, finite positive values,
exactly the dimensions each shape uses, a mode-count cap (2,500 modes below 4 k_c)
and a timeout so a single request can't run away. Values are never rounded.
