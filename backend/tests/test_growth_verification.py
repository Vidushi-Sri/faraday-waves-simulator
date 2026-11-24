"""Every growth rate the API shows must satisfy its defining equation:
threshold(k, f, fl, alpha, s) == a. Wrong-branch roots are withheld, never shown."""
import math

import pytest

from app.solver_bridge import ff

FL = ff.Fluid(1e-4, 1220.0, 0.065, 0.0029)


@pytest.mark.parametrize("geometry", [
    {"shape": "infinite"}, {"shape": "channel", "L": 4.01e-3},
    {"shape": "box", "Lx": 0.01, "Ly": 0.01}, {"shape": "cylinder", "R": 0.01},
])
@pytest.mark.parametrize("a", [80.0, 100.0, 150.0, 300.0])
def test_every_shown_growth_rate_reproduces_applied_a(client, body, geometry, a):
    body["geometry"], body["forcing"]["value"] = geometry, a
    res = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    modes = [m for m in [res["critical_mode"], res["fastest_unstable_mode"], *res["lowest_modes"]] if m]
    for m in modes:
        s = m["growth_rate_per_s"]
        if s is None:
            continue
        alpha = 0.5 if m["response"] == "subharmonic" else 0.0
        back = ff.threshold(m["wavenumber_per_m"], 60.0, FL, alpha, s)
        assert math.isclose(back, a, rel_tol=1e-6), (m["label"], s, back)


def test_reference_growth_rate_is_kept(client, body):
    """Near onset the solver's root is exact and must still be shown."""
    res = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    assert res["critical_mode"]["growth_rate_per_s"] == pytest.approx(7.7093, abs=1e-3)
