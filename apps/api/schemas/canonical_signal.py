from datetime import datetime
from enum import Enum
from typing import Any, Dict

from pydantic import BaseModel, Field, field_validator


class SignalSource(str, Enum):
    weather = "weather"
    traffic = "traffic"
    social = "social"
    citizen_report = "citizen_report"


class GeoLocation(BaseModel):
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        if not -90 <= v <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return v

    @field_validator("lng")
    @classmethod
    def validate_lng(cls, v: float) -> float:
        if not -180 <= v <= 180:
            raise ValueError("Longitude must be between -180 and 180")
        return v


class CanonicalSignal(BaseModel):
    timestamp: datetime = Field(..., description="Time of the signal")
    geo: GeoLocation = Field(..., description="Geographical location of the signal")
    source: SignalSource = Field(..., description="Source of the signal")
    raw_text: str = Field(..., description="Raw text content of the signal")
    structured_data: Dict[str, Any] = Field(
        default_factory=dict, description="Structured data extracted from the signal"
    )

    @field_validator("raw_text")
    @classmethod
    def validate_raw_text(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("raw_text cannot be empty")
        return v
