"""Pydantic request/response models for the Phase 1 API (v1).

Contract follows docs/Frontend_Integration_Handoff section 4, finalised against
the real return values of faraday_floquet.analyze(). Units: SI everywhere;
where a field is ALSO given in mm or 1/mm for display, the conversion is done
here on the server and the unit is in the field name. Values are never rounded.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

Pos = Field(gt=0, allow_inf_nan=False)
NonNeg = Field(ge=0, allow_inf_nan=False)

Shape = Literal["infinite", "channel", "box", "cylinder"]
REQUIRED_DIMS: dict[str, tuple[str, ...]] = {
    "infinite": (), "channel": ("L",), "box": ("Lx", "Ly"), "cylinder": ("R",),
}


# ------------------------------------------------------------------ request
class Forcing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["acceleration", "displacement"]
    value: float = NonNeg
    unit: Literal["m/s^2", "m"]

    @model_validator(mode="after")
    def unit_matches_kind(self):
        expected = "m/s^2" if self.kind == "acceleration" else "m"
        if self.unit != expected:
            raise ValueError(f"unit must be '{expected}' when kind is '{self.kind}'")
        return self


class FluidIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kinematic_viscosity_m2_s: float = Pos
    density_kg_m3: float = Pos
    surface_tension_n_m: float = Pos


class Geometry(BaseModel):
    """Dimensions in metres. Exactly the dimensions the solver's container
    class needs: channel L; box Lx, Ly; cylinder R; infinite none."""
    model_config = ConfigDict(extra="forbid")
    shape: Shape
    L: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    Lx: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    Ly: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    R: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def dims_match_shape(self):
        need = REQUIRED_DIMS[self.shape]
        missing = [d for d in need if getattr(self, d) is None]
        extra = [d for d in ("L", "Lx", "Ly", "R") if d not in need and getattr(self, d) is not None]
        if missing:
            raise ValueError(f"{', '.join(missing)} required for {self.shape} geometry")
        if extra:
            raise ValueError(f"{', '.join(extra)} not used by {self.shape} geometry")
        return self


class CriticalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    frequency_hz: float = Pos
    forcing: Forcing
    fluid: FluidIn
    depth_m: float = Pos
    geometry: Geometry
    include_plot_data: bool = False


# ------------------------------------------------------------------ response
class Mode(BaseModel):
    label: str                          # solver label, e.g. "k_c", "m=1", "(m,n)=(1,2)"
    wavenumber_per_m: float
    wavenumber_per_mm: float
    wavelength_mm: float
    threshold_subharmonic_m_s2: Optional[float]   # None where the solver found no finite threshold
    threshold_harmonic_m_s2: Optional[float]
    critical_acceleration_m_s2: Optional[float]
    response: Literal["subharmonic", "harmonic"]
    unstable: bool                      # a > a_c for this mode (solver's own flag)
    growth_rate_per_s: Optional[float]  # None when the solver does not compute it (a <= 0.5 a_c)


class Results(BaseModel):
    status: Literal["unstable", "stable", "no_critical_mode_found"]
    applied_acceleration_m_s2: float    # equals the input, or (2 pi f)^2 d for displacement input
    critical_acceleration_m_s2: Optional[float]
    ratio_applied_to_critical: Optional[float]
    critical_mode: Optional[Mode]       # first mode to go unstable in this container
    fastest_unstable_mode: Optional[Mode]
    lowest_modes: list[Mode]            # up to 10, sorted by threshold (solver's n_report)
    unbounded_reference: dict           # infinite-layer k_c, lambda_c, a_c (solver's kc_inf, ac_inf)


class CurvePoint(BaseModel):
    wavenumber_per_mm: float
    wavelength_mm: float
    a_m_s2: Optional[float]             # None where threshold() returned inf


class TongueMinimum(BaseModel):
    order: int                          # 1,3,5... subharmonic; 2,4,... harmonic
    response_frequency: str             # "f/2", "f", "3f/2", ...
    wavenumber_per_mm: float
    a_m_s2: float


class Curve(BaseModel):
    response: Literal["subharmonic", "harmonic"]
    points: list[CurvePoint]            # lower envelope of all tongues of this response type
    minima: list[TongueMinimum]         # grid minima, for labelling only


class AllowedMode(BaseModel):
    label: str
    wavenumber_per_mm: float
    critical_acceleration_m_s2: float
    response: Literal["subharmonic", "harmonic"]
    unstable: bool


class Pattern(BaseModel):
    """Onset pattern from container.pattern(): surface elevation, arbitrary
    units, normalised to max |value| = 1 for display."""
    kind: Literal["line", "field"]
    x_mm: list[float]
    y_mm: Optional[list[float]] = None
    values: list[float] | list[list[Optional[float]]]   # line: eta(x); field: rows over y, None outside the container


class Plots(BaseModel):
    tongues: list[Curve]
    plot_range: dict                    # k range and a ceiling, as in faraday_floquet.plot_tongues
    allowed_modes: list[AllowedMode]    # finite containers only (discrete k)
    pattern: Optional[Pattern]


class CriticalResponse(BaseModel):
    status: Literal["success"] = "success"
    model: dict
    inputs: dict
    results: Results
    plots: Optional[Plots] = None
    assumptions: list[str]
    warnings: list[str]
    provenance: dict


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    code: str
    message: str
    field_errors: dict[str, str] = {}
    error_id: Optional[str] = None
