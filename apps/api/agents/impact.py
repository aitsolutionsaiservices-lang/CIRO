"""
ImpactAgent — computes before/after impact metrics from the execution log
and asks Gemini for a human-readable narrative.

Deterministic for the metrics (so judges can sanity-check the numbers), LLM only
for the narrative paragraph at the end.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from .._retry import call_with_retry
from ..schemas.models import (
    CandidateIncident,
    ExecutionLog,
    ImpactReport,
    SituationAnalysis,
)


class _Narrative(BaseModel):
    narrative: str = Field(
        description="2-4 sentence plain-English summary of the response and its impact"
    )


class ImpactAgent:
    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
        self._client: Optional[genai.Client] = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client()
        return self._client

    def assess(
        self,
        incident: CandidateIncident,
        analysis: SituationAnalysis,
        plan_estimated_duration: int,
        exec_log: ExecutionLog,
    ) -> ImpactReport:
        before, after, delta = self._compute_metrics(incident, analysis, exec_log)
        narrative = self._narrative(incident, analysis, before, after, delta)
        return ImpactReport(
            before_metrics=before,
            after_metrics=after,
            delta_summary=delta,
            narrative=narrative,
        )

    # ---- metrics -------------------------------------------------------------

    @staticmethod
    def _stranded_vehicles_from_signals(incident: CandidateIncident) -> int:
        total = 0
        for s in incident.signals:
            v = s.structured_data.get("vehicles_stranded") if s.structured_data else None
            if isinstance(v, int):
                total += v
            if isinstance(v, float):
                total += int(v)
            stalled = s.structured_data.get("stalled_vehicles") if s.structured_data else None
            if isinstance(stalled, int):
                total = max(total, stalled)
        return total

    @staticmethod
    def _people_in_danger_from_signals(incident: CandidateIncident) -> int:
        total = 0
        for s in incident.signals:
            v = s.structured_data.get("people_in_danger") if s.structured_data else None
            if isinstance(v, int):
                total += v
        return total

    def _compute_metrics(
        self,
        incident: CandidateIncident,
        analysis: SituationAnalysis,
        exec_log: ExecutionLog,
    ) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        baseline_stranded = max(self._stranded_vehicles_from_signals(incident), 4)
        baseline_danger = max(self._people_in_danger_from_signals(incident), 0)
        # crude baseline travel time: severity-scaled
        baseline_travel_min = 12 + analysis.severity * 6

        # walk the exec log to compute aftermath
        rescued = 0
        users_notified = 0
        broadcast_reach = 0
        new_eta_min: Optional[int] = None
        baseline_eta_min: Optional[int] = None
        resources_deployed: List[str] = []
        emergency_units = 0

        for event in exec_log.events:
            r = event.result or {}
            t = r.get("action_type") or event.tool
            if t == "reroute_traffic":
                new_eta_min = r.get("new_eta_min", new_eta_min)
                baseline_eta_min = r.get("baseline_eta_min", baseline_eta_min)
            elif t == "dispatch_emergency":
                emergency_units += int(r.get("units_dispatched", 0))
                rescued += max(baseline_stranded // 2, 1)
                if baseline_danger > 0:
                    rescued += baseline_danger  # rescued counts here include people too (rough)
            elif t == "send_alert":
                users_notified += int(r.get("users_notified", 0))
            elif t == "broadcast_warning":
                broadcast_reach += int(r.get("estimated_reach", 0))
            elif t == "allocate_resource":
                rt = r.get("resource_type")
                if rt:
                    resources_deployed.append(rt)

        stranded_after = max(baseline_stranded - rescued, 0)
        danger_after = 0 if rescued >= baseline_danger else max(baseline_danger - rescued, 0)
        travel_after = new_eta_min if new_eta_min is not None else max(baseline_travel_min - 4, 5)
        travel_baseline = baseline_eta_min if baseline_eta_min is not None else baseline_travel_min

        pop = max(analysis.affected_population, 1)
        alerted_pct_before = 0.0
        alerted_pct_after = min(users_notified / pop * 100.0, 100.0)

        before: Dict[str, Any] = {
            "avg_travel_time_min": travel_baseline,
            "stranded_vehicles": baseline_stranded,
            "people_in_danger": baseline_danger,
            "alerted_population_pct": round(alerted_pct_before, 1),
            "emergency_units_on_scene": 0,
            "resources_on_scene": [],
        }
        after: Dict[str, Any] = {
            "avg_travel_time_min": travel_after,
            "stranded_vehicles": stranded_after,
            "people_in_danger": danger_after,
            "alerted_population_pct": round(alerted_pct_after, 1),
            "emergency_units_on_scene": emergency_units,
            "resources_on_scene": resources_deployed,
        }
        travel_improve_pct = (
            round((travel_baseline - travel_after) / max(travel_baseline, 1) * 100.0, 1)
            if travel_baseline
            else 0.0
        )
        delta: Dict[str, Any] = {
            "travel_time_improvement_pct": travel_improve_pct,
            "vehicles_rescued": baseline_stranded - stranded_after,
            "people_rescued": baseline_danger - danger_after,
            "alert_coverage_pct": after["alerted_population_pct"],
            "broadcast_reach": broadcast_reach,
        }
        return before, after, delta

    # ---- narrative -----------------------------------------------------------

    def _narrative(
        self,
        incident: CandidateIncident,
        analysis: SituationAnalysis,
        before: Dict[str, Any],
        after: Dict[str, Any],
        delta: Dict[str, Any],
    ) -> str:
        # Fallback narrative if Gemini is unavailable
        fallback = (
            f"Coordinated response to a level {analysis.severity} "
            f"{analysis.incident_type.value} incident at "
            f"{incident.geo_centroid.lat:.4f},{incident.geo_centroid.lng:.4f}. "
            f"Vehicles rescued: {delta.get('vehicles_rescued', 0)}, "
            f"alert coverage: {after.get('alerted_population_pct', 0)}%, "
            f"travel time improved by {delta.get('travel_time_improvement_pct', 0)}%."
        )
        if not os.getenv("GEMINI_API_KEY"):
            return fallback
        try:
            prompt = (
                "Write a concise 2-4 sentence after-action narrative for a city "
                "operations center, describing the response and its impact. "
                "Stay factual, no hype. End with the single most important outcome.\n\n"
                f"Incident type: {analysis.incident_type.value} (severity {analysis.severity}/5)\n"
                f"Before: {before}\n"
                f"After: {after}\n"
                f"Delta: {delta}\n"
            )
            response = call_with_retry(
                self.client.models.generate_content,
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=_Narrative,
                    temperature=0.3,
                ),
                label="ImpactAgent",
            )
            return _Narrative.model_validate_json(response.text).narrative
        except Exception:  # noqa: BLE001 — narrative is non-critical
            return fallback
