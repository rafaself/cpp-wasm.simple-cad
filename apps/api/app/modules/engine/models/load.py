from enum import Enum
from pydantic import BaseModel, Field, validator


class LoadType(str, Enum):
    TUG = "TUG"
    TUE = "TUE"
    LIGHTING = "LIGHTING"
    OTHER = "OTHER"


class Load(BaseModel):
    id: str
    x: float
    y: float
    power: float = Field(..., gt=0, description="Power in watts")
    voltage: int = Field(..., gt=0)
    type: LoadType = LoadType.TUG

    @validator("x", "y")
    def finite_coords(cls, v: float) -> float:
        if not isinstance(v, (int, float)) or not (v == v) or v in (float("inf"), float("-inf")):
            raise ValueError("Coordinates must be finite numbers")
        return float(v)

