from typing import Any, Dict, List

from pydantic import BaseModel, Field, field_validator


class Action(BaseModel):
    type: str = Field(..., description="Type of action to take")
    priority: int = Field(
        ..., description="Priority of the action, lower number is higher priority"
    )
    parameters: Dict[str, Any] = Field(
        default_factory=dict, description="Parameters for the action"
    )

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Action type cannot be empty")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Priority must be 1 or greater")
        return v


class ActionPlan(BaseModel):
    actions: List[Action] = Field(..., description="List of actions to execute")
    dependencies: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Action dependencies, map of action type to list of preceding action types",
    )
    estimated_duration: int = Field(
        ..., description="Estimated duration in minutes"
    )

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, v: List[Action]) -> List[Action]:
        if not v:
            raise ValueError("Action plan must contain at least one action")
        return v

    @field_validator("estimated_duration")
    @classmethod
    def validate_estimated_duration(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Estimated duration cannot be negative")
        return v
