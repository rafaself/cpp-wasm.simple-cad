from typing import List, Union
from pydantic import AnyHttpUrl, BaseSettings, validator


class Settings(BaseSettings):
    project_name: str = "Alsogravity Backend"
    version: str = "1.0.0"
    cors_origins: List[Union[AnyHttpUrl, str]] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    @validator("cors_origins", pre=True)
    def assemble_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    class Config:
        case_sensitive = True


settings = Settings()
