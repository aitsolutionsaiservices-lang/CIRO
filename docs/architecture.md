# CIRO — Architecture

## Design principles

1. **Schemas first.** Every agent boundary is a Pydantic v2 model. Agents
   are *typed transformers* between schemas, not loose function calls.
   This means the LLM-driven steps use Gemini's structured output to
   enforce shape — no ad-hoc JSON parsing, no prompt engineering for format
   compliance.
2. **Deterministic where possible, LLM where it matters.** Clustering,
   simulation, and metric computation are deterministic functions. Severity
   judgement, planning, and after-action narrative are LLM tasks. This
   keeps demos repeatable and judges able to sanity-check numbers, while
   still showing real agent reasoning.
3. **Event-sourced run state.** The orchestrator emits an append-only event
   log per run. The web and mobile clients are pure projections of that
   log. Replay is free; debugging is just reading the log.
4. **One pipeline, many surfaces.** The same backend powers both the
   web Command Center (operator view) and the mobile app (Citizen +
   Responder). Different surfaces, identical underlying state.

## Components

```
              ┌─────────────────────────────────────────────┐
              │                  FastAPI                    │
              │                                             │
   client ───►│  POST /scenarios/run                        │
              │  POST /scenarios/synthesize                 │
              │  POST /signals                              │
              │  GET  /runs, /runs/{id}                     │
              │  WS   /ws/runs/{id}                         │
              │                                             │
              │  ┌────────────────────────────────────────┐ │
              │  │      Orchestrator (async)              │ │
              │  │                                        │ │
              │  │  for incident in detect(signals):      │ │
              │  │    analyse → plan → simulate → impact  │ │
              │  │  emit(event)  ─────────► RunManager    │ │
              │  └────────────────────────────────────────┘ │
              │                  │                          │
              │                  ▼                          │
              │            RunManager                       │
              │   (in-mem; one cond-var per run; WS         │
              │    handlers await new events)               │
              └─────────────────────────────────────────────┘
```

### Crisis entry points

The same orchestrator handles three kinds of input, all producing identical
downstream event streams:

| Entry point | Signal source | Use case |
| --- | --- | --- |
| `POST /scenarios/run` with `{scenario}` | Loaded from `infra/seed/*.json` | Canned demo scenarios |
| `POST /scenarios/synthesize` with `{center, incident_type, radius_km, signal_count, description}` | Generated on-the-fly by `apps/api/scenario_synthesizer.py` from templates | Operator drops a pin / draws a polygon |
| `POST /signals` with `{raw_text, lat, lng, ...}` | Single citizen submission, optionally enriched via Gemini | Mobile app citizen reports |

`scenario_synthesizer.py` uses a stable seed derived from
`(lat, lng, incident_type, radius)` so re-clicking the same point produces
the same crisis — the demo is fully repeatable for judges.

### Agents

| Agent | Input | Output | LLM? |
| --- | --- | --- | --- |
| `IngestionAgent` | `dict` or raw text + geo + source | `CanonicalSignal` | Optional (only for free-form citizen text) |
| `DetectionAgent` | `list[CanonicalSignal]` | `list[CandidateIncident]` | No |
| `AnalysisAgent` | `CandidateIncident` | `SituationAnalysis` | Yes — Gemini structured output |
| `PlanningAgent` | `SituationAnalysis`, `CandidateIncident` | `ActionPlan` | Yes — Gemini structured output |
| `SimulationAgent` | `ActionPlan`, `CandidateIncident`, `SituationAnalysis` | `ExecutionLog` | No |
| `ImpactAgent` | `CandidateIncident`, `SituationAnalysis`, `ExecutionLog` | `ImpactReport` | Yes — narrative only; metrics are deterministic |

### Detection algorithm

Spatial + temporal greedy clustering:

- Two signals belong to the same cluster if they are within `radius_km`
  (default 1.5) AND within `time_window` (default 30 min).
- A new signal joins the **nearest** existing cluster within those bounds.
  Otherwise it starts a new cluster.
- Clusters with fewer than `min_signals` (default 2) are discarded as
  noise.

### Simulation handlers

`SimulationAgent` dispatches by `Action.type`:

| Action type | Mock output |
| --- | --- |
| `reroute_traffic` | 5-point alternate polyline around blocked area; baseline vs new ETA; drivers affected |
| `dispatch_emergency` | Ticket ID, depot, service type, units, ETA |
| `send_alert` | Channels, target pop, users notified, delivery % |
| `allocate_resource` | Resource type, units, deploy ETA, supplier |
| `broadcast_warning` | Channels, estimated reach, advisory level |

All handlers are seeded by `(action_type, cluster_id, priority)` so the
demo is fully repeatable.

### Impact metrics (deterministic)

`before_metrics` and `after_metrics` are derived from a combination of:

- Signal-derived baselines (e.g. `structured_data.vehicles_stranded`).
- Severity-scaled assumptions where signals don't say (e.g. baseline travel
  time = `12 + 6 * severity`).
- Aftermath aggregates from the execution log (e.g. sum of
  `users_notified`, `new_eta_min` from the first reroute event).

The Gemini call only generates the narrative paragraph — the numbers stay
inspectable.

## Event types streamed over WebSocket

```
scenario_started     run started, includes raw signal count
ingestion_complete   canonical signals available
incident_detected    a cluster became an incident
agent_started        agent X started on cluster Y
analysis_complete    SituationAnalysis produced
planning_complete    ActionPlan produced
execution_event      one Action executed
execution_complete   full ExecutionLog assembled
impact_complete      ImpactReport produced
incident_complete    incident pipeline done
scenario_complete    every incident processed
scenario_failed      something went wrong, error attached
```

## Trade-offs

- **In-memory runs**: chosen for hackathon velocity. Drop in Postgres +
  Redis pub/sub later without changing agent code.
- **One pipeline run per scenario**: real systems would multiplex many
  signals through a continuously running detector. The codebase is
  organised so the detector can run on a sliding window of recent signals.
- **No retry/back-off on Gemini calls**: production would wrap each agent
  in tenacity-style retries. For demo, agents fail loud and the run is
  marked `failed` with the error attached.
- **Synthesizer uses templates, not Gemini**: each ad-hoc crisis still
  drives 3+ Gemini calls (analysis, planning, impact narrative), but the
  *input* signals are template-generated so we don't burn free-tier quota
  pre-generating the same content every click.
