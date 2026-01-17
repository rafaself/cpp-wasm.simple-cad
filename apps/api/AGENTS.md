# Backend Agents Guide (`apps/api`)

## Core Responsibilities
- **API**: REST endpoints via FastAPI.
- **Validation**: Pydantic models for all inputs/outputs.
- **Statelessness**: The API should be horizontally scalable.

## Commands
- **Run**: `uvicorn app.main:app --reload`
- **Install**: `pip install -r requirements.txt`

## Architecture Rules
1. **Type Safety**: All Python code must be fully typed (mypy compliant).
2. **Contracts**: Use Pydantic schemas as the single source of truth for API contracts.
3. **No Frontend Logic**: Do not serve HTML/JS. Return JSON only.

## Directory Structure
- `app/main.py`: Entry point.
- `app/core/`: Config and security.
- `app/modules/`: Feature modules (routers, services, models).
