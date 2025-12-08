import pytest
from pydantic import ValidationError
# These imports will fail initially, which is expected in TDD
# We are defining the interface we want to implement
from app.modules.engine.models.load import Load, LoadType
from app.modules.engine.models.conduit import Conduit

def test_load_creation_valid():
    """Test creating a valid electrical load (Tomada)."""
    load = Load(
        id="load_1",
        x=100.5,
        y=200.5,
        power=100.0,
        voltage=127,
        type=LoadType.TUG  # Tomada de Uso Geral
    )
    assert load.power == 100.0
    assert load.voltage == 127
    assert load.type == LoadType.TUG

def test_load_power_validation():
    """Test that power must be positive."""
    with pytest.raises(ValidationError):
        Load(
            id="load_invalid",
            x=0, y=0,
            power=-10, # Invalid power
            voltage=127,
            type=LoadType.TUG
        )

def test_conduit_creation_valid():
    """Test creating a valid conduit (Eletroduto)."""
    conduit = Conduit(
        id="cond_1",
        from_node="load_1",
        to_node="load_2",
        length=3.5,
        diameter=0.75, # 3/4 inch
        material="PVC"
    )
    assert conduit.length == 3.5
    assert conduit.diameter == 0.75
