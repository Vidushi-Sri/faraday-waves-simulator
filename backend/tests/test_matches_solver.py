"""Accuracy: what the API returns must be exactly what faraday_floquet.analyze()
returns for the same inputs, for every container. The adapter may reshape,
never change, a number."""
import pytest

from app.solver_bridge import ff

CASES = [
    ({"shape": "infinite"}, lambda: ff.Infinite()),
    ({"shape": "channel", "L": 4.01e-3}, lambda: ff.Channel(4.01e-3)),
    ({"shape": "box", "Lx": 0.01, "Ly": 0.01}, lambda: ff.Box(0.01, 0.01)),
    ({"shape": "cylinder", "R": 0.01}, lambda: ff.UprightCylinder(0.01)),
]


@pytest.mark.parametrize("geometry,make", CASES, ids=[c[0]["shape"] for c in CASES])
@pytest.mark.parametrize("a", [80.0, 100.0])
def test_api_equals_direct_solver(client, body, geometry, make, a):
    body["geometry"], body["forcing"]["value"] = geometry, a
    api = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    fl = ff.Fluid(1e-4, 1220.0, 0.065, 0.0029)
    direct = ff.analyze(a, 60.0, fl, make())
    first = direct["first"]
    assert api["critical_mode"]["label"] == first["mode"]
    assert api["critical_acceleration_m_s2"] == first["a_c"]                 # bit-for-bit, no rounding
    assert api["critical_mode"]["wavenumber_per_m"] == first["k"]
    assert api["status"] == ("unstable" if first["unstable"] else "stable")
    assert [m["label"] for m in api["lowest_modes"]] == [r["mode"] for r in direct["modes"]]
    s = first["s"]
    assert api["critical_mode"]["growth_rate_per_s"] == pytest.approx(s, rel=1e-9)
