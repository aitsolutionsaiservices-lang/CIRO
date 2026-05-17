from typing import Any, Dict

from pydantic import BaseModel, Field, field_validator


class ImpactReport(BaseModel):
    before_metrics: Dict[str, Any] = Field(
        ..., description="Metrics before the actions were taken"
    )
    after_metrics: Dict[str, Any] = Field(
        ..., description="Metrics after the actions were taken"
    )
    delta_summary: Dict[str, Any] = Field(
        ..., description="Summary of the changes between before and after metrics"
    )
    narrative: str = Field(..., description="Text narrative describing the impact")

    @field_validator("narrative")
    @classmethod
    def validate_narrative(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Narrative cannot be empty")
        return v
