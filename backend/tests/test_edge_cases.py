"""Edge cases: the app must either match the solver or refuse with a clear reason,
never show a number the solver cannot support."""
import pytest

from app.solver_bridge import ff


def post(client, body):
    return client.post("/api/v1/phase1/critical", json=body)


def test_exactly_at_threshold_is_stable_with_zero_growth(client, body):
    ac = ff.critical_infinite(60.0, ff.Fluid(1e-4, 1220.0, 0.065, 0.0029))[1]
    body["forcing"]["value"] = ac
    res = post(client, body).json()["results"]
    assert res["status"] == "stable"                         # solver's rule: unstable iff a > a_c
    assert res["critical_mode"]["growth_rate_per_s"] == pytest.approx(0.0, abs=1e-6)


def test_zero_forcing_is_stable_and_growth_not_computed(client, body):
    body["forcing"]["value"] = 0.0
    res = post(client, body).json()["results"]
    assert res["status"] == "stable" and res["critical_mode"]["growth_rate_per_s"] is None


@pytest.mark.parametrize("f", [0.5, 0.2])
def test_first_tongue_outside_solver_search_window_is_refused(client, body, f):
    body["frequency_hz"] = f
    r = post(client, body)
    assert r.status_code == 422 and r.json()["code"] == "OUT_OF_RANGE"
    assert "frequency_hz" in r.json()["field_errors"]


@pytest.mark.parametrize("f", [2.0, 10.0, 200.0, 1000.0])
def test_in_range_frequencies_still_solve(client, body, f):
    body["frequency_hz"] = f
    assert post(client, body).status_code == 200


def test_container_with_no_modes_reports_none_found(client, body):
    body["geometry"] = {"shape": "channel", "L": 1e-5}
    res = post(client, body).json()["results"]
    assert res["status"] == "no_critical_mode_found" and res["critical_acceleration_m_s2"] is None


def test_implausible_forcing_is_refused_with_a_units_hint(client, body):
    body["forcing"] = {"kind": "displacement", "value": 2.0, "unit": "m"}      # about 29,000 g
    r = post(client, body)
    j = r.json()
    assert r.status_code == 422 and j["code"] == "FORCING_TOO_LARGE"
    assert "Did you mean 2 mm" in j["message"] and "forcing.value" in j["field_errors"]


def test_far_above_onset_is_flagged(client, body):
    body["forcing"]["value"] = 1000.0                                          # about 11 a_c, about 100 g
    j = post(client, body).json()
    assert "times the onset threshold" in " ".join(j["warnings"])
