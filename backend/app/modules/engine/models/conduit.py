from pydantic import BaseModel, Field
from typing import Optional

class Conduit(BaseModel):
    id: str
    from_node: str
    to_node: str
    length: float = Field(..., gt=0, description="Length in meters")
    diameter: float = Field(..., gt=0, description="Diameter in inches")
    material: str = "PVC"
    occupancy_percent: Optional[float] = Field(0.0, ge=0, le=100)
