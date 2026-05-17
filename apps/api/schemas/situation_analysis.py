from enum import Enum

from pydantic import BaseModel, Field, field_validator


class IncidentType(str, Enum):
    flood = "flood"
    heatwave = "heatwave"
    accident = "accident"
    infrastructure = "infrastructure"
    blockage = "blockage"


class SituationAnalysis(BaseModel):
    incident_type: IncidentType = Field(..., description="Type of incident")
    severity: int = Field(..., description="Severity level from 1 to 5")
    confidence_pct: float = Field(..., description="Confidence percentage from 0 to 100")
    affected_population: int = Field(
        ..., description="Estimated number of affected population"
    )
    reasoning: str = Field(
        ..., description="Text explaining the reasoning behind the analysis"
    )

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: int) -> int:
        if not 1 <= v <= 5:
            raise ValueError("Severity must be between 1 and 5")
        return v

    @field_validator("confidence_pct")
    @classmethod
    def validate_confidence_pct(cls, v: float) -> float:
        if not 0 <= v <= 100:
            raise ValueError("Confidence percentage must be between 0 and 100")
        return v

    @field_validator("affected_population")
    @classmethod
    def validate_affected_population(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Affected population cannot be negative")
        return v

    @field_validator("reasoning")
    @classmethod
    def validate_reasoning(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("reasoning cannot be empty")
        return v
