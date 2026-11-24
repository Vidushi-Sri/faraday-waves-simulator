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


def test_far_above_onset_matches_solver_thresholds_and_flags(client, body):
    # 10 mm square box at 600 m/s^2, about 6.3 a_c: growth rates are skipped,
    # everything else must equal the solver's own analyze() at that forcing
    a = 600.0
    body["forcing"]["value"] = a
    body["geometry"] = {"shape": "box", "Lx": 0.01, "Ly": 0.01}
    j = post(client, body).json()
    ref = ff.analyze(a, 60.0, ff.Fluid(1e-4, 1220.0, 0.065, 0.0029), ff.Box(0.01, 0.01))
    got = j["results"]["lowest_modes"]
    assert [m["label"] for m in got] == [str(r["mode"]) for r in ref["modes"]]
    for m, r in zip(got, ref["modes"]):
        assert m["critical_acceleration_m_s2"] == pytest.approx(r["a_c"], rel=1e-12)
        assert m["unstable"] == r["unstable"] and m["growth_rate_per_s"] is None
    assert j["results"]["status"] == "unstable"
    assert "growth rates are not shown" in " ".join(j["warnings"])


def test_strong_forcing_in_a_large_cylinder_finishes_quickly(client, body):
    # 0.05 m displacement at 60 Hz (about 720 g) in a 50 mm cylinder used to run past 60 s
    import time
    body["forcing"] = {"kind": "displacement", "value": 0.05, "unit": "m"}
    body["depth_m"] = 0.08
    body["geometry"] = {"shape": "cylinder", "R": 0.05}
    body["include_plot_data"] = True
    t = time.perf_counter()
    r = post(client, body)
    assert r.status_code == 200 and time.perf_counter() - t < 30
    res = r.json()["results"]
    assert res["critical_mode"]["label"] == "(m,s)=(16,6)"
    assert res["critical_acceleration_m_s2"] == pytest.approx(81.533, rel=1e-4)
