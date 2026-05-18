"""
PlanningAgent — converts a SituationAnalysis into a concrete ActionPlan via Gemini.

The agent reasons about which coordinated actions a city operations center should
take, in what priority, with what parameters. Output is a strongly-typed
ActionPlan that downstream SimulationAgent can execute.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Literal, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from ..schemas.models import (
    Action,
    ActionPlan,
    CandidateIncident,
    SituationAnalysis,
)


ActionType = Literal[
    "reroute_traffic",
    "dispatch_emergency",
    "send_alert",
    "allocate_resource",
    "broadcast_warning",
]


class _PlannedAction(BaseModel):
    """LLM-facing action shape. Uses concrete fields Gemini can fill reliably."""

    type: ActionType
    priority: int = Field(ge=1, le=5, description="1 = highest priority")
    target_lat: float
    target_lng: float
    radius_km: float = Field(ge=0.0, le=20.0)
    summary: str = Field(description="One-line operator-facing description of the action")
    rationale: str = Field(description="Why this action, given the situation")
    # Type-specific hints — Gemini fills what's relevant
    service_type: Optional[str] = Field(
        default=None,
        description="For dispatch_emergency: ambulance | fire | rescue | police",
    )
    units: Optional[int] = Field(default=None, ge=0, description="Number of units to dispatch")
    channels: Optional[List[str]] = Field(
        default=None,
        description="For send_alert / broadcast_warning: e.g. ['push','sms','radio']",
    )
    message: Optional[str] = Field(
        default=None, description="Citizen-facing alert / warning text"
    )
    resource_type: Optional[str] = Field(
        default=None,
        description="For allocate_resource: water_pump | barrier | generator | rescue_boat",
    )


class _PlannedDependency(BaseModel):
    after: ActionType = Field(description="Action that must complete first")
    before: ActionType = Field(description="Action that depends on `after`")


class _PlannedActionPlan(BaseModel):
    actions: List[_PlannedAction]
    dependencies: List[_PlannedDependency] = Field(default_factory=list)
    estimated_duration_min: int = Field(ge=0)


class PlanningAgent:
    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
        self._client: Optional[genai.Client] = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client()
        return self._client

    def plan(
        self,
        analysis: SituationAnalysis,
        incident: CandidateIncident,
    ) -> ActionPlan:
        prompt = self._build_prompt(analysis, incident)
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_PlannedActionPlan,
                temperature=0.3,
            ),
        )
        planned = _PlannedActionPlan.model_validate_json(response.text)
        return self._to_action_plan(planned)

    def _build_prompt(
        self, analysis: SituationAnalysis, incident: CandidateIncident
    ) -> str:
        return (
            "You are the lead crisis planner for a metropolitan emergency operations "
            "center. Given the situation analysis and the underlying signal cluster, "
            "produce a coordinated action plan.\n\n"
            "Action types you may use:\n"
            "  - reroute_traffic: redirect drivers around an impassable area\n"
            "  - dispatch_emergency: send rescue / ambulance / fire units to a location\n"
            "  - send_alert: targeted push/SMS to citizens in the affected radius\n"
            "  - allocate_resource: deploy water pumps, barriers, generators, boats\n"
            "  - broadcast_warning: wider public-channel advisory (radio, news, social)\n\n"
            "Pick 3 to 6 actions, prioritized 1 (highest) to 5. Use concrete coordinates "
            "(can be the incident centroid or a slightly offset staging point). For each "
            "action, write a one-line summary and a short rationale tied to the situation.\n\n"
            f"SituationAnalysis:\n{analysis.model_dump_json(indent=2)}\n\n"
            f"CandidateIncident (signal count = {incident.signal_count}, "
            f"centroid = {incident.geo_centroid.lat:.4f},{incident.geo_centroid.lng:.4f}):\n"
            f"{incident.model_dump_json(indent=2)}\n"
        )

    @staticmethod
    def _to_action_plan(planned: _PlannedActionPlan) -> ActionPlan:
        actions: List[Action] = []
        for pa in planned.actions:
            params: Dict[str, Any] = {
                "summary": pa.summary,
                "rationale": pa.rationale,
                "target": {"lat": pa.target_lat, "lng": pa.target_lng},
                "radius_km": pa.radius_km,
            }
            if pa.service_type is not None:
                params["service_type"] = pa.service_type
            if pa.units is not None:
                params["units"] = pa.units
            if pa.channels is not None:
                params["channels"] = pa.channels
            if pa.message is not None:
                params["message"] = pa.message
            if pa.resource_type is not None:
                params["resource_type"] = pa.resource_type
            actions.append(Action(type=pa.type, priority=pa.priority, parameters=params))

        dependencies: Dict[str, List[str]] = {}
        for dep in planned.dependencies:
            dependencies.setdefault(dep.before, []).append(dep.after)

        return ActionPlan(
            actions=actions,
            dependencies=dependencies,
            estimated_duration=planned.estimated_duration_min,
        )
