"""FastAPI app for the Phase 1 web frontend (API v1).

Routes (handoff section 4):
  GET  /api/v1/health          service + solver provenance
  GET  /api/v1/capabilities    supported shapes, input modes, units, phase status
  POST /api/v1/phase1/critical one Phase 1 critical-threshold calculation

Errors are structured {"status":"error","code","message","field_errors"};
tracebacks and file paths are logged server-side only, never sent.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .schemas import REQUIRED_DIMS, CriticalRequest, CriticalResponse, ErrorResponse
from .services.phase1_service import SolverLimitError, run_critical
from .solver_bridge import SOLVER_PROVENANCE

API_VERSION = "1.0.0"
# below the hosting platform's 60 s function limit, so our own message reaches the page first
SOLVE_TIMEOUT_S = float(os.getenv("SOLVE_TIMEOUT_S", "50"))
ORIGINS = [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

log = logging.getLogger("faraday.api")
app = FastAPI(title="Surface Waves Simulator API", version=API_VERSION,
              description="Phase 1 linear viscous Floquet solver (Kumar 1996) over HTTP.")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type"], allow_credentials=False)


def _err(status: int, code: str, message: str, field_errors: dict | None = None, error_id: str | None = None):
    body = ErrorResponse(code=code, message=message, field_errors=field_errors or {}, error_id=error_id)
    return JSONResponse(status_code=status, content=body.model_dump(exclude_none=True))


@app.exception_handler(RequestValidationError)
async def on_validation(_: Request, exc: RequestValidationError):
    fields: dict[str, str] = {}
    for e in exc.errors():
        loc = [str(p) for p in e["loc"] if p not in ("body",)]
        # model-level validators report on the object; keep the object path
        msg = e["msg"].removeprefix("Value error, ")
        fields[".".join(loc) or "body"] = msg
    return _err(422, "INVALID_INPUT", "Some inputs are invalid.", fields)


@app.exception_handler(Exception)
async def on_unexpected(_: Request, exc: Exception):
    error_id = uuid.uuid4().hex[:12]
    log.exception("unhandled error %s", error_id)
    return _err(500, "CALCULATION_FAILED", "The calculation failed on the server.", error_id=error_id)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "api_version": API_VERSION,
            "solver": {k: SOLVER_PROVENANCE[k] for k in ("module", "repo_commit", "solver_sha256")}}


@app.get("/api/v1/capabilities")
def capabilities():
    return {
        "api_version": API_VERSION,
        "phase1": {
            "status": "available",
            "shapes": [
                {"id": "infinite", "label": "Infinite layer", "dimensions": []},
                {"id": "channel", "label": "Channel (2-D)", "dimensions": [{"name": "L", "unit": "m"}]},
                {"id": "box", "label": "Rectangular box", "dimensions": [{"name": "Lx", "unit": "m"}, {"name": "Ly", "unit": "m"}]},
                {"id": "cylinder", "label": "Upright cylinder", "dimensions": [{"name": "R", "unit": "m"}]},
            ],
            "required_dimensions": REQUIRED_DIMS,
            "forcing_kinds": [{"kind": "acceleration", "unit": "m/s^2"}, {"kind": "displacement", "unit": "m"}],
            "units": {"frequency_hz": "Hz", "depth_m": "m", "kinematic_viscosity_m2_s": "m^2/s",
                      "density_kg_m3": "kg/m^3", "surface_tension_n_m": "N/m"},
        },
    }


@app.post("/api/v1/phase1/critical", response_model=CriticalResponse, response_model_exclude_none=False,
          responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}, 504: {"model": ErrorResponse}})
async def phase1_critical(req: CriticalRequest):
    try:
        return await asyncio.wait_for(run_in_threadpool(run_critical, req), timeout=SOLVE_TIMEOUT_S)
    except SolverLimitError as e:
        return _err(422, e.code, e.message, {e.field: e.message} if e.field else None)
    except asyncio.TimeoutError:
        return _err(504, "TIMEOUT", f"The calculation took longer than {SOLVE_TIMEOUT_S:g} s and was stopped.")
