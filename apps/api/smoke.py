"""
Quick offline smoke test — verifies the deterministic agents work end-to-end
WITHOUT requiring a Gemini API key.

Usage:
    python -m apps.api.smoke
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    seed_path = Path(__file__).resolve().parents[2] / "infra" / "seed" / "flood_dha.json"
    if not seed_path.exists():
        print(f"[FAIL] seed file missing: {seed_path}")
        return 1
    data = json.loads(seed_path.read_text(encoding="utf-8"))
    raw_signals = data["signals"]
    print(f"[OK] loaded seed: {data['name']} ({len(raw_signals)} signals)")

    # Imports must succeed
    try:
        from .agents.ingestion import IngestionAgent
        from .agents.detection import DetectionAgent
        from .agents.simulation import SimulationAgent, blocked_polygon
        from .agents.impact import ImpactAgent
        from .schemas.models import (
            ActionPlan,
            Action,
            SituationAnalysis,
            IncidentType,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] import error: {exc}")
        return 1
    print("[OK] all agent modules import")

    # Ingestion (deterministic — no LLM)
    ingestion = IngestionAgent()
    signals = ingestion.ingest_batch(raw_signals)
    print(f"[OK] ingested {len(signals)} canonical signals")

    # Detection
    detector = DetectionAgent()
    incidents = detector.detect(signals)
    print(f"[OK] detected {len(incidents)} candidate incident(s)")
    if not incidents:
        print("[FAIL] expected at least one incident")
        return 1
    incident = incidents[0]
    for inc in incidents:
        print(
            f"     - {inc.cluster_id} signals={inc.signal_count} "
            f"centroid=({inc.geo_centroid.lat:.4f},{inc.geo_centroid.lng:.4f})"
        )
    incident = max(incidents, key=lambda i: i.signal_count)

    # Synthesize a fake analysis + plan so we can exercise simulation + impact
    fake_analysis = SituationAnalysis(
        incident_type=IncidentType.flood,
        severity=4,
        confidence_pct=88.0,
        affected_population=2500,
        reasoning="Smoke test stub analysis.",
    )
    fake_plan = ActionPlan(
        actions=[
            Action(
                type="reroute_traffic",
                priority=1,
                parameters={
                    "summary": "Detour around Khayaban-e-Ittehad",
                    "rationale": "Road impassable",
                    "target": {
                        "lat": incident.geo_centroid.lat,
                        "lng": incident.geo_centroid.lng,
                    },
                    "radius_km": 0.5,
                },
            ),
            Action(
                type="dispatch_emergency",
                priority=2,
                parameters={
                    "summary": "Dispatch rescue boat",
                    "rationale": "Stranded vehicles & pedestrian",
                    "target": {
                        "lat": incident.geo_centroid.lat,
                        "lng": incident.geo_centroid.lng,
                    },
                    "radius_km": 0.3,
                    "service_type": "rescue",
                    "units": 2,
                },
            ),
            Action(
                type="send_alert",
                priority=3,
                parameters={
                    "summary": "Push alert to nearby residents",
                    "rationale": "Warn citizens to avoid the area",
                    "target": {
                        "lat": incident.geo_centroid.lat,
                        "lng": incident.geo_centroid.lng,
                    },
                    "radius_km": 1.0,
                    "channels": ["push", "sms"],
                    "message": "Avoid Khayaban-e-Ittehad — flooded.",
                },
            ),
        ],
        dependencies={},
        estimated_duration=45,
    )

    sim = SimulationAgent(base_time=datetime.now(tz=timezone.utc))
    exec_log = sim.execute(fake_plan, incident, fake_analysis)
    print(f"[OK] simulated {len(exec_log.events)} actions")
    for ev in exec_log.events:
        print(f"     - {ev.tool} -> {ev.result.get('status')}")

    # Impact — narrative path will fall back since no Gemini key in smoke test
    impact = ImpactAgent().assess(incident, fake_analysis, fake_plan.estimated_duration, exec_log)
    print(f"[OK] impact computed: travel_time_improvement_pct="
          f"{impact.delta_summary.get('travel_time_improvement_pct')}, "
          f"alert_coverage_pct={impact.delta_summary.get('alert_coverage_pct')}")

    poly = blocked_polygon(incident)
    print(f"[OK] blocked polygon has {len(poly)} vertices")

    print()
    print("=== SMOKE PASSED ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
