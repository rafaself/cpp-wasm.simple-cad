from enum import Enum
from pydantic import BaseModel, Field

class LoadType(str, Enum):
    TUG = "TUG"          # Tomada de Uso Geral
    TUE = "TUE"          # Tomada de Uso Especifico
    ILUMINACAO = "ILUMINACAO" 

class Load(BaseModel):
    id: str
    x: float
    y: float
    power: float = Field(..., gt=0, description="Power in Watts or VA")
    voltage: int = Field(..., gt=0, description="Voltage (127 or 220)")
    type: LoadType
