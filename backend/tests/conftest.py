import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # backend/ on path

from app.main import app  # noqa: E402

# Kumar (1996) Fig. 2 fluid at 60 Hz, the project's validated reference case
# (handoff section 4.2: a_c = 91.19 m/s^2, k_c = 0.7817 1/mm, lambda_c = 8.038 mm).
REFERENCE = {
    "frequency_hz": 60.0,
    "forcing": {"kind": "acceleration", "value": 100.0, "unit": "m/s^2"},
    "fluid": {"kinematic_viscosity_m2_s": 1.0e-4, "density_kg_m3": 1220.0, "surface_tension_n_m": 0.065},
    "depth_m": 0.0029,
    "geometry": {"shape": "infinite"},
}


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture
def body():
    import copy
    return copy.deepcopy(REFERENCE)
