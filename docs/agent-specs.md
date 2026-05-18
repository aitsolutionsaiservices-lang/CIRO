# CIRO — Agent specifications

Every agent is a typed transformer. This file documents the contract for
each one. Schemas live in [apps/api/schemas/](../apps/api/schemas/).

---

## 1. IngestionAgent

Source: [apps/api/agents/ingestion.py](../apps/api/agents/ingestion.py)

| Method | Signature | Notes |
| --- | --- | --- |
| `ingest_dict(d)` | `dict → CanonicalSignal` | Validates and coerces a structured payload (seed JSON, weather API response). No LLM. |
| `ingest_batch(items)` | `list[dict] → list[CanonicalSignal]` | Convenience wrapper. |
| `ingest_raw(text, geo, source, enrich=True)` | text → `CanonicalSignal` | Free-form path. Optionally enriches `structured_data` via Gemini using the `_IngestionEnrichment` schema (urgency, keywords, people_in_danger, vehicles_stranded, language). |

Enrichment is gated on `GEMINI_API_KEY` being set; if not, the signal is
saved with empty `structured_data` and processing continues.

---

## 2. DetectionAgent

Source: [apps/api/agents/detection.py](../apps/api/agents/detection.py)

Parameters (constructor):

- `radius_km` — default `1.5`
- `time_window_min` — default `30`
- `min_signals` — default `2`

Output: `list[CandidateIncident]`. Cluster IDs are deterministic:
`inc-{YYYYMMDDTHHMMSSZ}-{idx}` based on the earliest signal in the cluster.

Algorithm: greedy nearest-cluster assignment with haversine distance and
a time-window guard. See `_haversine_km`.

---

## 3. AnalysisAgent

Source: [apps/api/agents/analysis.py](../apps/api/agents/analysis.py)

Gemini call:

- `model = GEMINI_MODEL` (default `gemini-2.5-pro`)
- `response_mime_type = "application/json"`
- `response_schema = SituationAnalysis`
- `temperature = 0.2`

The schema enforces severity ∈ [1,5], confidence ∈ [0,100], non-empty
reasoning, and a typed `IncidentType` enum. The LLM cannot produce a
malformed analysis.

---

## 4. PlanningAgent

Source: [apps/api/agents/planning.py](../apps/api/agents/planning.py)

The agent maintains two schemas:

- `_PlannedAction` / `_PlannedActionPlan` — LLM-facing, with concrete typed
  fields (target_lat, target_lng, channels, etc.) so Gemini's structured
  output is reliable.
- `ActionPlan` / `Action` — the project's user-facing schema with
  `parameters: Dict[str, Any]`.

`_to_action_plan` maps between them, packing typed planner fields into
`Action.parameters` (`summary`, `rationale`, `target`, `radius_km`,
plus any of `service_type`, `units`, `channels`, `message`,
`resource_type`).

Allowed action types: `reroute_traffic`, `dispatch_emergency`,
`send_alert`, `allocate_resource`, `broadcast_warning`.

The agent asks Gemini for 3–6 actions with priorities 1–5.

---

## 5. SimulationAgent

Source: [apps/api/agents/simulation.py](../apps/api/agents/simulation.py)

Deterministic. Each `Action.type` has a handler returning the mock-tool
result; `_seed(...)` makes randomness reproducible.

| Action | Output keys |
| --- | --- |
| `reroute_traffic` | `status`, `alternate_polyline` (5 points), `baseline_eta_min`, `new_eta_min`, `drivers_affected` |
| `dispatch_emergency` | `status`, `ticket_id` (`EMG-#####`), `service_type`, `units_dispatched`, `eta_min`, `depot` |
| `send_alert` | `status`, `channels`, `target_population`, `users_notified`, `delivery_pct`, `message_preview` |
| `allocate_resource` | `status`, `resource_type`, `units_deployed`, `deploy_eta_min`, `supplier` |
| `broadcast_warning` | `status`, `channels`, `estimated_reach`, `advisory_level` |

Each handler also receives the `Action`, `CandidateIncident`, and
`SituationAnalysis` so the result reflects the actual situation (radius,
severity, location, …).

Events are emitted via an optional `on_event` callback so the orchestrator
can stream them over WebSocket as they happen.

---

## 6. ImpactAgent

Source: [apps/api/agents/impact.py](../apps/api/agents/impact.py)

Splits into:

- **Metrics (deterministic)** — `_compute_metrics(...)` returns
  `(before, after, delta)`. Pulls baselines from `structured_data` and
  severity-scaled defaults; computes aftermath from the execution log.
- **Narrative (LLM)** — Gemini structured output with `_Narrative` schema
  (a single `narrative: str` field), prompted with the full metrics. Has
  a graceful fallback narrative if the LLM is unavailable.

---

## Orchestrator

Source: [apps/api/orchestrator.py](../apps/api/orchestrator.py)

- `RunManager` — in-memory store of runs. Each `_RunState` owns its own
  `asyncio.Condition` for WS broadcast.
- `Orchestrator.run(signals, scenario_name)` — kicks off the pipeline as a
  background task and immediately returns the `_RunState` so the API can
  respond with the `run_id`.
- Pipeline:
  1. Ingestion (batch, deterministic).
  2. Detection (deterministic).
  3. For each incident → `_process_incident` runs Analysis → Planning →
     Simulation (streaming per-action events) → Impact.
  4. Emits `scenario_complete` / `scenario_failed`.

All LLM calls are wrapped in `asyncio.to_thread(...)` so the event loop
stays responsive while Gemini is generating.
