"""
Orchestrator — wires Ingestion → Detection → Analysis → Planning → Simulation → Impact
into an end-to-end pipeline and streams progress events to subscribers (WebSockets).

Design notes:
    * Agents are synchronous (Gemini SDK is sync). We run the whole pipeline inside
      asyncio.to_thread so the event loop stays responsive. Each agent emits one or
      more events into the run's event log, and an asyncio.Event wakes any WS
      subscribers waiting for new events.
    * A "run" is one execution of the pipeline on a set of signals. Runs are kept
      in-memory in `RunManager` (no DB — this is a demo).
    * Per-incident state is tracked in `IncidentBundle` for easy serialization to
      the dashboard.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from pydantic import BaseModel, Field

from .agents.analysis import AnalysisAgent
from .agents.detection import DetectionAgent
from .agents.impact import ImpactAgent
from .agents.ingestion import IngestionAgent
from .agents.planning import PlanningAgent
from .agents.simulation import SimulationAgent, blocked_polygon
from .schemas.models import (
    ActionPlan,
    CandidateIncident,
    CanonicalSignal,
    ExecutionEvent,
    ExecutionLog,
    ImpactReport,
    SituationAnalysis,
)

logger = logging.getLogger("ciro.orchestrator")


# ---------------------------------------------------------------------------
# State models
# ---------------------------------------------------------------------------


class IncidentBundle(BaseModel):
    """Aggregated state for one incident as it moves through the pipeline."""

    cluster_id: str
    status: str = "detected"  # detected | analyzing | planning | simulating | impact | done
    candidate: CandidateIncident
    blocked_polygon: List[Dict[str, float]] = Field(default_factory=list)
    analysis: Optional[SituationAnalysis] = None
    plan: Optional[ActionPlan] = None
    exec_log: Optional[ExecutionLog] = None
    impact: Optional[ImpactReport] = None


class RunSummary(BaseModel):
    run_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str = "running"  # running | completed | failed
    error: Optional[str] = None
    signal_count: int = 0
    incident_count: int = 0


class RunSnapshot(BaseModel):
    summary: RunSummary
    signals: List[CanonicalSignal] = Field(default_factory=list)
    incidents: List[IncidentBundle] = Field(default_factory=list)
    events: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# RunManager — in-memory store with WebSocket broadcast
# ---------------------------------------------------------------------------


class _RunState:
    def __init__(self, run_id: str) -> None:
        self.summary = RunSummary(
            run_id=run_id, started_at=datetime.now(tz=timezone.utc)
        )
        self.signals: List[CanonicalSignal] = []
        self.incidents: Dict[str, IncidentBundle] = {}
        self.events: List[Dict[str, Any]] = []
        self._cond = asyncio.Condition()

    async def append_event(self, event: Dict[str, Any]) -> None:
        async with self._cond:
            self.events.append(event)
            self._cond.notify_all()

    async def wait_for_event(self, after_index: int) -> List[Dict[str, Any]]:
        """Wait until events list grows past after_index, then return the new slice."""
        async with self._cond:
            while len(self.events) <= after_index and self.summary.status == "running":
                await self._cond.wait()
            return self.events[after_index:]

    def snapshot(self) -> RunSnapshot:
        return RunSnapshot(
            summary=self.summary,
            signals=self.signals,
            incidents=list(self.incidents.values()),
            events=list(self.events),
        )


class RunManager:
    def __init__(self) -> None:
        self._runs: Dict[str, _RunState] = {}

    def create(self) -> _RunState:
        run_id = f"run-{uuid.uuid4().hex[:10]}"
        state = _RunState(run_id)
        self._runs[run_id] = state
        return state

    def get(self, run_id: str) -> Optional[_RunState]:
        return self._runs.get(run_id)

    def list_summaries(self) -> List[RunSummary]:
        return [s.summary for s in self._runs.values()]


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class Orchestrator:
    def __init__(self, manager: RunManager) -> None:
        self.manager = manager
        self.ingestion = IngestionAgent()
        self.detection = DetectionAgent()
        self.analysis = AnalysisAgent()
        self.planning = PlanningAgent()
        self.impact = ImpactAgent()

    async def run(
        self, raw_signals: List[Dict[str, Any]], scenario_name: Optional[str] = None
    ) -> _RunState:
        state = self.manager.create()
        await self._emit(
            state,
            "scenario_started",
            {
                "run_id": state.summary.run_id,
                "scenario": scenario_name or "custom",
                "signal_count_raw": len(raw_signals),
            },
        )
        # Launch the pipeline in the background — caller gets the state immediately
        # so it can return a run_id while work continues.
        asyncio.create_task(self._run_pipeline(state, raw_signals))
        return state

    async def _run_pipeline(
        self, state: _RunState, raw_signals: List[Dict[str, Any]]
    ) -> None:
        try:
            # ---- Ingestion -------------------------------------------------
            signals = await asyncio.to_thread(self.ingestion.ingest_batch, raw_signals)
            state.signals = signals
            state.summary.signal_count = len(signals)
            await self._emit(
                state,
                "ingestion_complete",
                {"signal_count": len(signals), "signals": [s.model_dump(mode="json") for s in signals]},
            )

            # ---- Detection -------------------------------------------------
            incidents = await asyncio.to_thread(self.detection.detect, signals)
            state.summary.incident_count = len(incidents)
            for inc in incidents:
                bundle = IncidentBundle(
                    cluster_id=inc.cluster_id,
                    candidate=inc,
                    blocked_polygon=blocked_polygon(inc),
                )
                state.incidents[inc.cluster_id] = bundle
                await self._emit(
                    state,
                    "incident_detected",
                    {
                        "cluster_id": inc.cluster_id,
                        "signal_count": inc.signal_count,
                        "centroid": inc.geo_centroid.model_dump(),
                        "bundle": bundle.model_dump(mode="json"),
                    },
                )

            # ---- Per-incident agentic loop --------------------------------
            for cluster_id, bundle in state.incidents.items():
                await self._process_incident(state, bundle)

            state.summary.status = "completed"
            state.summary.finished_at = datetime.now(tz=timezone.utc)
            await self._emit(state, "scenario_complete", {"run_id": state.summary.run_id})

        except Exception as exc:  # noqa: BLE001 — surface to dashboard
            logger.exception("pipeline failed")
            state.summary.status = "failed"
            state.summary.error = f"{type(exc).__name__}: {exc}"
            state.summary.finished_at = datetime.now(tz=timezone.utc)
            await self._emit(
                state,
                "scenario_failed",
                {"error": state.summary.error},
            )

    async def _process_incident(self, state: _RunState, bundle: IncidentBundle) -> None:
        # Analysis
        bundle.status = "analyzing"
        await self._emit(state, "agent_started", {"agent": "AnalysisAgent", "cluster_id": bundle.cluster_id})
        analysis = await asyncio.to_thread(self.analysis.analyze, bundle.candidate)
        bundle.analysis = analysis
        await self._emit(
            state,
            "analysis_complete",
            {"cluster_id": bundle.cluster_id, "analysis": analysis.model_dump(mode="json")},
        )

        # Planning
        bundle.status = "planning"
        await self._emit(state, "agent_started", {"agent": "PlanningAgent", "cluster_id": bundle.cluster_id})
        plan = await asyncio.to_thread(self.planning.plan, analysis, bundle.candidate)
        bundle.plan = plan
        await self._emit(
            state,
            "planning_complete",
            {"cluster_id": bundle.cluster_id, "plan": plan.model_dump(mode="json")},
        )

        # Simulation — stream per-action events
        bundle.status = "simulating"
        await self._emit(state, "agent_started", {"agent": "SimulationAgent", "cluster_id": bundle.cluster_id})
        sim = SimulationAgent()

        # We collect events synchronously inside to_thread, then emit them on the main loop.
        collected: List[ExecutionEvent] = []

        def _on_event(ev: ExecutionEvent) -> None:
            collected.append(ev)

        exec_log = await asyncio.to_thread(
            sim.execute, plan, bundle.candidate, analysis, _on_event
        )
        bundle.exec_log = exec_log
        for ev in collected:
            await self._emit(
                state,
                "execution_event",
                {"cluster_id": bundle.cluster_id, "event": ev.model_dump(mode="json")},
            )
        await self._emit(
            state,
            "execution_complete",
            {
                "cluster_id": bundle.cluster_id,
                "event_count": len(exec_log.events),
                "exec_log": exec_log.model_dump(mode="json"),
            },
        )

        # Impact
        bundle.status = "impact"
        await self._emit(state, "agent_started", {"agent": "ImpactAgent", "cluster_id": bundle.cluster_id})
        impact = await asyncio.to_thread(
            self.impact.assess,
            bundle.candidate,
            analysis,
            plan.estimated_duration,
            exec_log,
        )
        bundle.impact = impact
        await self._emit(
            state,
            "impact_complete",
            {"cluster_id": bundle.cluster_id, "impact": impact.model_dump(mode="json")},
        )

        bundle.status = "done"
        await self._emit(
            state,
            "incident_complete",
            {"cluster_id": bundle.cluster_id, "bundle": bundle.model_dump(mode="json")},
        )

    # ---- helpers ----------------------------------------------------------

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(tz=timezone.utc).isoformat()

    async def _emit(self, state: _RunState, event_type: str, data: Dict[str, Any]) -> None:
        event = {
            "ts": self._now_iso(),
            "run_id": state.summary.run_id,
            "type": event_type,
            "data": data,
        }
        await state.append_event(event)
