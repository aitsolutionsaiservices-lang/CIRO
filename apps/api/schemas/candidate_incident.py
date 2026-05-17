from typing import List

from pydantic import BaseModel, Field, field_validator

from .canonical_signal import CanonicalSignal, GeoLocation


class CandidateIncident(BaseModel):
    cluster_id: str = Field(..., description="Unique identifier for the cluster")
    signals: List[CanonicalSignal] = Field(
        ..., description="List of signals forming this candidate incident"
    )
    geo_centroid: GeoLocation = Field(
        ..., description="Geographical center of the incident"
    )
    signal_count: int = Field(..., description="Number of signals in this cluster")

    @field_validator("cluster_id")
    @classmethod
    def validate_cluster_id(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("cluster_id cannot be empty")
        return v

    @field_validator("signals")
    @classmethod
    def validate_signals(cls, v: List[CanonicalSignal]) -> List[CanonicalSignal]:
        if not v:
            raise ValueError("At least one signal is required")
        return v

    @field_validator("signal_count")
    @classmethod
    def validate_signal_count(cls, v: int) -> int:
        if v < 1:
            raise ValueError("signal_count must be at least 1")
        return v
