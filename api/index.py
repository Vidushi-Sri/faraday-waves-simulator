"""Vercel entry point: serves the FastAPI app (routes under /api/v1)."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))   # app package
sys.path.insert(0, str(ROOT))               # faraday_floquet.py

# Git-connected deployments have no .git folder; Vercel passes the commit instead.
if not os.getenv("SOURCE_COMMIT") and os.getenv("VERCEL_GIT_COMMIT_SHA"):
    os.environ["SOURCE_COMMIT"] = os.environ["VERCEL_GIT_COMMIT_SHA"][:7]

from app.main import app  # noqa: E402,F401
