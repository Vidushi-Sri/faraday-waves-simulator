"""Regression: the API must reproduce the established solver result.
Tolerance 0.1 % (values documented to 4 significant figures)."""
import pytest


def test_infinite_layer_60hz_reference(client, body):
    r = client.post("/api/v1/phase1/critical", json=body).json()
    res = r["results"]
    assert res["critical_acceleration_m_s2"] == pytest.approx(91.19, rel=1e-3)
    assert res["critical_mode"]["wavenumber_per_mm"] == pytest.approx(0.7817, rel=1e-3)
    assert res["critical_mode"]["wavelength_mm"] == pytest.approx(8.038, rel=1e-3)
    assert res["critical_mode"]["response"] == "subharmonic"
    assert res["status"] == "unstable"                      # 100 > 91.19
    assert res["critical_mode"]["growth_rate_per_s"] > 0


def test_below_threshold_is_stable(client, body):
    body["forcing"]["value"] = 80.0
    res = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    assert res["status"] == "stable"
    assert res["critical_mode"]["growth_rate_per_s"] < 0


def test_comsol_channel_case(client, body):
    """README CLI example: 4.01 mm channel = the COMSOL model; m = 1 sits at the reference minimum."""
    body["geometry"] = {"shape": "channel", "L": 4.01e-3}
    res = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    assert res["critical_mode"]["label"] == "m=1"
    assert res["critical_acceleration_m_s2"] == pytest.approx(91.19, rel=1e-3)


def test_displacement_matches_equivalent_acceleration(client, body):
    import math
    d = 100.0 / (2 * math.pi * 60.0) ** 2
    body["forcing"] = {"kind": "displacement", "value": d, "unit": "m"}
    res = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    assert res["applied_acceleration_m_s2"] == pytest.approx(100.0, rel=1e-12)
    assert res["status"] == "unstable"


def test_values_are_not_rounded(client, body):
    res = client.post("/api/v1/phase1/critical", json=body).json()["results"]
    assert res["critical_acceleration_m_s2"] != round(res["critical_acceleration_m_s2"], 4)
