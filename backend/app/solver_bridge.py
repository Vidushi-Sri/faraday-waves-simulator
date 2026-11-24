"""Bridge to the existing scientific core.

The research code (faraday_floquet.py) lives at the repository root and is NOT
modified or moved. This module puts the repo root on sys.path, imports the
solver once, and records provenance (git commit + file hash) so every API
response says exactly which solver produced it.
"""
from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import faraday_floquet as ff  # noqa: E402  (import after sys.path setup)

SOLVER_FILE = REPO_ROOT / "faraday_floquet.py"


def _git_commit() -> str | None:
    # deployments without git history pass the commit in an environment variable
    import os
    if os.getenv("SOURCE_COMMIT"):
        return os.environ["SOURCE_COMMIT"]
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT,
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


SOLVER_PROVENANCE = {
    "module": "faraday_floquet.py",
    "method": "linear_viscous_floquet",
    "reference": "K. Kumar (1996), Proc. R. Soc. Lond. A 452, 1113-1126",
    "fourier_truncation_N": ff.N_FOURIER,
    "gravity_m_s2": ff.Fluid.__dataclass_fields__["g"].default,
    "repo_commit": _git_commit(),
    "solver_sha256": _sha256(SOLVER_FILE),
}
