from datetime import datetime
from typing import Any, Dict, List

from pydantic import BaseModel, Field, field_validator


class ExecutionEvent(BaseModel):
    timestamp: datetime = Field(..., description="Time of the execution event")
    tool: str = Field(..., description="Tool or agent that performed the action")
    result: Dict[str, Any] = Field(
        ..., description="Result or output of the action"
    )

    @field_validator("tool")
    @classmethod
    def validate_tool(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("tool name cannot be empty")
        return v


class ExecutionLog(BaseModel):
    events: List[ExecutionEvent] = Field(
        default_factory=list, description="List of execution events"
    )
