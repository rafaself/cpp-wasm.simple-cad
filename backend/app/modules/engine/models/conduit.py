from pydantic import BaseModel, Field, validator


class Conduit(BaseModel):
    id: str
    from_node: str
    to_node: str
    length: float = Field(..., gt=0, description="Length in meters")
    diameter: float = Field(..., gt=0, description="Diameter in inches")
    material: str

    @validator("to_node")
    def distinct_nodes(cls, v, values):
        if "from_node" in values and v == values.get("from_node"):
            raise ValueError("Conduit endpoints must differ")
        return v

