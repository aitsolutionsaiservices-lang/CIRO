"""
SimulationAgent — "executes" each Action in an ActionPlan against mock tools.

Each action produces an ExecutionEvent capturing what would have happened in the
real world (rerouted polyline, dispatched units + ETA, alert delivery counts,
resource deployment, etc.). The simulation is deterministic given the same
input so the demo is repeatable.
"""

from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from ..schemas.models import (
    Action,
    ActionPlan,
    CandidateIncident,
    ExecutionEvent,
    ExecutionLog,
    SituationAnalysis,
)


class SimulationAgent:
    def __init__(self, base_time: Optional[datetime] = None) -> None:
        self.base_time = base_time or datetime.now(tz=timezone.utc)

    def execute(
        self,
        plan: ActionPlan,
        incident: CandidateIncident,
        analysis: SituationAnalysis,
        on_event: Optional[Callable[[ExecutionEvent], None]] = None,
    ) -> ExecutionLog:
        """Run every action in priority order. Optionally stream events via on_event."""
        handlers: Dict[str, Callable[[Action, CandidateIncident, SituationAnalysis], Dict[str, Any]]] = {
            "reroute_traffic": self._sim_reroute,
            "dispatch_emergency": self._sim_dispatch,
            "send_alert": self._sim_alert,
            "allocate_resource": self._sim_allocate,
            "broadcast_warning": self._sim_broadcast,
        }

        ordered = sorted(plan.actions, key=lambda a: a.priority)
        events: List[ExecutionEvent] = []
        cumulative_offset = 0

        for action in ordered:
            cumulative_offset += self._duration_for(action.type)
            handler = handlers.get(action.type, self._sim_generic)
            result = handler(action, incident, analysis)
            event = ExecutionEvent(
                timestamp=self.base_time + timedelta(seconds=cumulative_offset),
                tool=action.type,
                result={
                    "action_type": action.type,
                    "priority": action.priority,
                    "summary": action.parameters.get("summary", ""),
                    **result,
                },
            )
            events.append(event)
            if on_event is not None:
                on_event(event)

        return ExecutionLog(events=events)

    @staticmethod
    def _duration_for(action_type: str) -> int:
        return {
            "send_alert": 5,
            "broadcast_warning": 10,
            "reroute_traffic": 20,
            "allocate_resource": 60,
            "dispatch_emergency": 30,
        }.get(action_type, 15)

    @staticmethod
    def _seed(*parts: Any) -> int:
        h = hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()
        return int(h[:8], 16)

    # ---- per-action simulators ------------------------------------------------

    def _sim_reroute(
        self, action: Action, incident: CandidateIncident, _analysis: SituationAnalysis
    ) -> Dict[str, Any]:
        target = action.parameters.get("target", {})
        lat = target.get("lat", incident.geo_centroid.lat)
        lng = target.get("lng", incident.geo_centroid.lng)
        radius_km = action.parameters.get("radius_km", 1.0)
        rng = random.Random(self._seed("reroute", incident.cluster_id, action.priority))
        # Generate a 5-point detour polyline around the blocked area
        offset_deg = (radius_km + 0.3) / 111.0
        polyline = [
            {"lat": lat - offset_deg, "lng": lng - offset_deg},
            {"lat": lat - offset_deg * 0.5, "lng": lng - offset_deg * 1.3},
            {"lat": lat, "lng": lng - offset_deg * 1.5},
            {"lat": lat + offset_deg * 0.5, "lng": lng - offset_deg * 1.3},
            {"lat": lat + offset_deg, "lng": lng - offset_deg},
        ]
        baseline_eta = 18 + rng.randint(0, 6)
        new_eta = baseline_eta - rng.randint(4, 9)
        return {
            "status": "rerouted",
            "alternate_polyline": polyline,
            "baseline_eta_min": baseline_eta,
            "new_eta_min": max(new_eta, 4),
            "drivers_affected": rng.randint(180, 420),
        }

    def _sim_dispatch(
        self, action: Action, incident: CandidateIncident, _analysis: SituationAnalysis
    ) -> Dict[str, Any]:
        rng = random.Random(self._seed("dispatch", incident.cluster_id, action.priority))
        ticket = f"EMG-{rng.randint(10000, 99999)}"
        service = action.parameters.get("service_type", "rescue")
        units = action.parameters.get("units") or rng.randint(1, 4)
        return {
            "status": "dispatched",
            "ticket_id": ticket,
            "service_type": service,
            "units_dispatched": units,
            "eta_min": rng.randint(4, 12),
            "depot": "Korangi Fire Station 3"
            if service == "fire"
            else "DHA Rescue HQ",
        }

    def _sim_alert(
        self, action: Action, incident: CandidateIncident, analysis: SituationAnalysis
    ) -> Dict[str, Any]:
        rng = random.Random(self._seed("alert", incident.cluster_id, action.priority))
        radius_km = action.parameters.get("radius_km", 1.0)
        # crude population proxy: scale with severity & radius
        pop = int(analysis.affected_population * (1 + radius_km * 0.5))
        delivery_pct = 78 + rng.randint(0, 18)
        return {
            "status": "delivered",
            "channels": action.parameters.get("channels") or ["push", "sms"],
            "target_population": pop,
            "users_notified": int(pop * delivery_pct / 100),
            "delivery_pct": delivery_pct,
            "message_preview": (action.parameters.get("message") or "")[:140],
        }

    def _sim_allocate(
        self, action: Action, incident: CandidateIncident, _analysis: SituationAnalysis
    ) -> Dict[str, Any]:
        rng = random.Random(self._seed("allocate", incident.cluster_id, action.priority))
        resource = action.parameters.get("resource_type", "water_pump")
        units = action.parameters.get("units") or rng.randint(1, 3)
        return {
            "status": "deployed",
            "resource_type": resource,
            "units_deployed": units,
            "deploy_eta_min": rng.randint(20, 55),
            "supplier": "KMC Depot West"
            if resource in {"water_pump", "barrier"}
            else "DHA Civil Defence",
        }

    def _sim_broadcast(
        self, action: Action, _incident: CandidateIncident, analysis: SituationAnalysis
    ) -> Dict[str, Any]:
        rng = random.Random(self._seed("broadcast", action.priority))
        channels = action.parameters.get("channels") or ["radio", "tv", "twitter"]
        reach = int(analysis.affected_population * (3 + rng.random() * 2))
        return {
            "status": "broadcast",
            "channels": channels,
            "estimated_reach": reach,
            "advisory_level": ["info", "watch", "warning", "severe", "emergency"][
                min(max(analysis.severity - 1, 0), 4)
            ],
        }

    def _sim_generic(
        self, action: Action, _incident: CandidateIncident, _analysis: SituationAnalysis
    ) -> Dict[str, Any]:
        return {"status": "simulated", "note": f"no specialized simulator for {action.type}"}


# Convenience helper used by the orchestrator to compute a crude "blocked" polygon
# around the incident centroid — used for before/after map rendering.
def blocked_polygon(incident: CandidateIncident, radius_km: float = 0.4) -> List[Dict[str, float]]:
    lat = incident.geo_centroid.lat
    lng = incident.geo_centroid.lng
    deg_lat = radius_km / 111.0
    deg_lng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return [
        {"lat": lat + deg_lat, "lng": lng},
        {"lat": lat + deg_lat * 0.5, "lng": lng + deg_lng},
        {"lat": lat - deg_lat * 0.5, "lng": lng + deg_lng},
        {"lat": lat - deg_lat, "lng": lng},
        {"lat": lat - deg_lat * 0.5, "lng": lng - deg_lng},
        {"lat": lat + deg_lat * 0.5, "lng": lng - deg_lng},
    ]
