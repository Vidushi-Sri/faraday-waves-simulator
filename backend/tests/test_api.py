"""Contract, validation and error behaviour (handoff sections 5 and 6)."""


def post(client, body):
    return client.post("/api/v1/phase1/critical", json=body)


def test_health_reports_solver(client):
    j = client.get("/api/v1/health").json()
    assert j["status"] == "ok" and j["solver"]["module"] == "faraday_floquet.py"


def test_capabilities_list_the_four_phase1_containers(client):
    j = client.get("/api/v1/capabilities").json()
    assert {s["id"] for s in j["phase1"]["shapes"]} == {"infinite", "channel", "box", "cylinder"}
    assert "phase2" not in j


def test_plot_data_shapes(client, body):
    body["include_plot_data"] = True
    p = post(client, body).json()["plots"]
    assert [c["response"] for c in p["tongues"]] == ["subharmonic", "harmonic"]
    assert p["tongues"][0]["minima"][0]["response_frequency"] == "f/2"
    assert p["pattern"]["kind"] == "line"
    assert p["allowed_modes"] == []


def test_cylinder_pattern_is_masked_field(client, body):
    body["include_plot_data"] = True
    body["geometry"] = {"shape": "cylinder", "R": 0.01}
    pat = post(client, body).json()["plots"]["pattern"]
    assert pat["kind"] == "field" and pat["values"][0][0] is None   # corner lies outside the circle
    assert len(pat["values"]) == len(pat["y_mm"]) and len(pat["values"][0]) == len(pat["x_mm"])


def test_missing_dimension_is_field_error(client, body):
    body["geometry"] = {"shape": "box", "Lx": 0.01}
    r = post(client, body)
    assert r.status_code == 422
    j = r.json()
    assert j["status"] == "error" and j["code"] == "INVALID_INPUT"
    assert "Ly required" in j["field_errors"]["geometry"]


def test_unused_dimension_rejected(client, body):
    body["geometry"] = {"shape": "infinite", "L": 0.01}
    assert post(client, body).status_code == 422


def test_forcing_unit_must_match_kind(client, body):
    body["forcing"] = {"kind": "displacement", "value": 1e-4, "unit": "m/s^2"}
    r = post(client, body)
    assert r.status_code == 422 and "forcing" in r.json()["field_errors"]


def test_both_forcings_cannot_be_sent(client, body):
    body["forcing"]["displacement"] = 1e-4
    assert post(client, body).status_code == 422


def test_non_positive_and_non_finite_rejected(client, body):
    body["fluid"]["density_kg_m3"] = 0
    r = post(client, body)
    assert r.status_code == 422 and "fluid.density_kg_m3" in r.json()["field_errors"]
    body["fluid"]["density_kg_m3"] = 1220.0
    body["depth_m"] = float("inf")
    assert client.post("/api/v1/phase1/critical", content=__import__("json").dumps(body).replace("Infinity", "1e999"),
                       headers={"content-type": "application/json"}).status_code == 422


def test_oversized_container_refused_cleanly(client, body):
    body["geometry"] = {"shape": "box", "Lx": 1.0, "Ly": 1.0}
    r = post(client, body)
    assert r.status_code == 422 and r.json()["code"] == "CONTAINER_TOO_LARGE"


def test_no_traceback_leaks(client, body):
    r = post(client, {"frequency_hz": "abc"})
    assert r.status_code == 422 and "Traceback" not in r.text
