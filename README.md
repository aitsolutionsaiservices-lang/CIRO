<div align="center">
  <h1>🚨 Crisis Intelligence & Response Orchestrator (CIRO)</h1>
  <p><strong>Agentic AI pipeline for real-time urban emergency detection, planning, and dispatch.</strong></p>

  [![Build Status](https://img.shields.io/badge/build-passing-success?style=flat-square)](#)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](#)
  [![Made with Python](https://img.shields.io/badge/Made%20with-Python-1f425f.svg?style=flat-square)](#)
  [![Powered by Gemini](https://img.shields.io/badge/Powered%20by-Gemini-orange?style=flat-square)](#)
</div>

---

## 🌍 The Problem
During the catastrophic **2022 Pakistan floods**, fragmented communication, delayed response times, and an inability to process overwhelming amounts of signal data contributed to the tragic loss of over **1,700 lives**. Traditional emergency management systems struggle to ingest rapid, multi-modal data and coordinate logistics across affected sectors in real time.

## 🚀 Our Solution
**CIRO** is a next-generation crisis management platform powered by a sophisticated **6-Agent AI System**. By leveraging large language models, CIRO autonomously ingests social media and IoT weather signals, detects emergencies, generates actionable response plans, dispatches units, and simulates the impact of its interventions — drastically reducing ETA for first responders.

### The 6-Agent Pipeline

```
Signals → Ingestion → Detection → Analysis → Planning → Simulation → Impact
 (raw)    (canonical)  (clusters) (severity) (actions)  (mock tools) (before/after)
                                   Gemini     Gemini                  Gemini
```

1. **Ingestion Agent** — normalises raw inputs (weather, traffic, social, citizen reports) into `CanonicalSignal` objects. Free-form citizen text is enriched via Gemini structured output (urgency, vehicles_stranded, people_in_danger, language).
2. **Detection Agent** — spatiotemporal clustering (haversine + time window) groups co-occurring signals into `CandidateIncident`s. Deterministic, so demos are reproducible.
3. **Analysis Agent** — Gemini reasons over the cluster and produces a typed `SituationAnalysis` with severity (1–5), confidence %, affected population, and a written justification.
4. **Planning Agent** — Gemini converts the analysis into a coordinated `ActionPlan` of typed actions (reroute traffic, dispatch emergency, send alert, allocate resource, broadcast warning) with priorities and dependencies.
5. **Simulation Agent** — deterministically executes each action against mock tools and emits `ExecutionEvent`s (alternate-route polyline, ticket IDs, alert delivery counts, resource deployment ETAs).
6. **Impact Agent** — computes before/after metrics from the execution log (travel time, stranded vehicles, alert coverage, people rescued) and asks Gemini for an after-action narrative.

All six agents communicate via Pydantic v2 schemas. The orchestrator streams per-step events over a WebSocket so the dashboard and mobile app update **live** as decisions are made.

---

## 🎥 Demo
> *[Insert Demo Video Placeholder Here]*
>
> *Watch CIRO detect a localized flood and autonomously reroute emergency vehicles via the Web Dashboard.*

The scripted demo flow is in [`docs/demo-script.md`](./docs/demo-script.md).

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          apps/api  (FastAPI)                           │
│                                                                        │
│   POST /scenarios/run ─┐                                               │
│   POST /signals        │   Orchestrator.run_pipeline()                 │
│   GET  /runs/{id}      │     │                                         │
│   WS   /ws/runs/{id} ◄─┤     ▼                                         │
│                        │   Ingestion → Detection → Analysis (LLM)      │
│                        │     → Planning (LLM) → Simulation             │
│                        │     → Impact (LLM)                            │
│                        │                                                │
│   RunManager  ◄────────┘   emits {ts,type,data} events                 │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ WebSocket stream of events
                ┌─────────────────┴──────────────────┐
                ▼                                    ▼
┌──────────────────────────────┐      ┌──────────────────────────────┐
│  apps/web   Command Center   │      │  apps/mobile (Expo)          │
│  • Google Map (live overlays)│      │  • Citizen tab               │
│  • Incident list + status    │      │    – submit reports          │
│  • Agent trace feed          │      │    – nearby alerts           │
│  • Pipeline progress + KPI   │      │  • Responder tab             │
│  • Agent Graph view          │      │    – action queue            │
└──────────────────────────────┘      │    – before/after stats      │
                                       └──────────────────────────────┘
```

### Tech stack
- **Backend**: Python 3.11+, FastAPI, Pydantic v2, `google-genai` (Gemini 2.5 Flash / Pro), `uvicorn[standard]`, WebSockets
- **Web dashboard**: Vite + React 18 + TypeScript, Tailwind CSS, `@vis.gl/react-google-maps` (Google Maps JS API), `react-router-dom`
- **Mobile app**: Expo SDK 52, React Native 0.76, `expo-router`, `react-native-maps` (PROVIDER_GOOGLE), `expo-location`
- **AI core**: Google Gemini via `google-genai` with **structured output** + Pydantic schemas (no fragile prompt-parsing)
- **Maps**: Google Maps Platform (Maps JS API on web, Maps SDK for Android/iOS on mobile)

### Mapped to the brief

| Brief requirement | Where it lives |
| --- | --- |
| Multi-source input | `IngestionAgent` normalises weather / traffic / social / citizen reports into `CanonicalSignal` |
| Event detection | `DetectionAgent` runs spatiotemporal clustering → `CandidateIncident` |
| Reasoning & analysis | `AnalysisAgent` (Gemini structured output) → `SituationAnalysis` |
| Action planning | `PlanningAgent` (Gemini structured output) → typed `ActionPlan` |
| Action simulation | `SimulationAgent` runs each action against mock tools (rerouted polyline, ticket IDs, alert reach, resource deployment) |
| Outcome visualization | Command Center: before-vs-after panel, animated map overlays, live agent trace; mobile Responder: action queue + impact stats |
| Agentic workflow | Six coordinated agents, dependency-aware planning, streamed event log = full audit trail |

---

## 🛠️ Quickstart

### Prerequisites
- Python 3.11+
- Node.js 20+
- A Google Cloud API key with **Generative Language API**, **Maps JavaScript API**, and **Maps SDK for Android/iOS** enabled.

### 1. Backend (FastAPI + orchestrator)
```powershell
# from project root
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
# or: source .venv/bin/activate # macOS/Linux
pip install -e .

# fill in your Gemini API key
Copy-Item apps\api\.env.example apps\api\.env
# edit apps\api\.env and set GEMINI_API_KEY

# run the server (listens on 0.0.0.0 so a phone on the same WiFi can reach it)
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: <http://localhost:8000/health> — should return `{"status":"ok","gemini_key":true,"model":"gemini-2.5-flash"}`.

### 2. Web dashboard
```powershell
cd apps\web
Copy-Item .env.example .env.local
# edit .env.local and set VITE_GOOGLE_MAPS_KEY
npm install
npm run dev
# http://localhost:5173
```

In the header, pick the scenario from the dropdown and click **Run Scenario**.

### 3. Mobile app (Expo Go)
```powershell
cd apps\mobile
Copy-Item .env.example .env.local
# edit .env.local — set EXPO_PUBLIC_API_BASE to your laptop's LAN IP, e.g.
#   EXPO_PUBLIC_API_BASE=http://192.168.1.4:8000
npm install --legacy-peer-deps
npx expo start --lan
```

Scan the QR with **Expo Go** on Android (or the Camera app on iOS, same WiFi as the laptop).

---

## 📁 Repository layout

```
apps/
  api/                 FastAPI + 6 agents + orchestrator
    agents/            ingestion, detection, analysis, planning, simulation, impact
    schemas/           Pydantic v2 models shared across agents
    main.py            REST + WebSocket endpoints
    orchestrator.py    pipeline + RunManager + event broadcast
    smoke.py           offline integration test (no Gemini needed)
  web/                 Vite + React + TS Command Center (Google Maps JS API)
  mobile/              Expo + React Native (Citizen / Responder)
docs/
  architecture.md      deeper architecture write-up
  agent-specs.md       per-agent inputs/outputs/contracts
  demo-script.md       suggested demo flow for the video
infra/seed/
  flood_dha.json       10 signals — DHA Phase 6 monsoon flooding scenario
```

---

## 🧠 Google Antigravity usage

CIRO uses Google Gemini as the reasoning fabric for its agents:

- **Structured output, end-to-end.** Every LLM call goes out with `response_mime_type="application/json"` and a Pydantic `response_schema`. Output shapes are validated against the schema before they're handed to the next agent. See `apps/api/agents/analysis.py`, `planning.py`, `impact.py`, `ingestion.py`.
- **Multi-agent workflow.** Six purpose-built agents wired together by a thin orchestrator. Each one has a single responsibility, a Pydantic input contract, and a Pydantic output contract. The orchestrator owns ordering and dependency.
- **Tool integration via Google Maps Platform.** Maps JavaScript API powers the web Command Center (markers, polygons, polylines, dark colorScheme); Maps SDK for Android/iOS powers the mobile maps via `react-native-maps` with `PROVIDER_GOOGLE`.
- **Configurable model.** `GEMINI_MODEL` defaults to `gemini-2.5-flash` (free-tier accessible). Drop in `gemini-2.5-pro` on a billed project for stronger reasoning at higher cost.

---

## ⚠️ Assumptions

- **Simulated tools.** Traffic rerouting, emergency dispatch, alerts, and resource allocation are simulated against deterministic mock services. Each handler in `SimulationAgent` can be swapped with a real API later.
- **Scenario data is fictional.** The DHA flood scenario uses realistic geography, PMD station IDs, and Karachi monsoon language — but the citizens, ticket IDs, and populations are seeded for the demo.
- **In-memory state.** Runs live in an in-memory `RunManager`. A real deployment would persist them in Postgres + Redis pub/sub. The orchestrator is structured so this swap is straightforward.
- **Same API key for Gemini + Maps.** A single Google Cloud API key can cover both, provided the relevant APIs are enabled. In production, split by least-privilege and rotate independently.

---

## 🔐 Security
Never commit `apps/api/.env`, `apps/web/.env.local`, or `apps/mobile/.env.local` — they contain secrets. The repository's `.gitignore` already excludes them. Rotate keys after any incident.

---

## 👥 Team
- **Saad** — Architecture & Full-Stack Development
- *[Add team members here]*

---

<div align="center">
  <p>Built with ❤️ to build a safer, more resilient future.</p>
</div>
