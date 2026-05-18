# CIRO — Demo script (3–5 min video)

Goal: show the full end-to-end loop — multi-source input → detected crisis
→ coordinated plan → simulated response → impact — and surface the
agentic reasoning at every step.

## Setup

Have three windows visible:

1. Web Command Center at `localhost:5173`
2. Mobile app on a connected phone (Expo Go) showing the Citizen tab
3. (Optional) Terminal tailing `uvicorn` logs

## Pre-flight (off-camera)

```powershell
# api
uvicorn apps.api.main:app --reload
# web
cd apps/web; npm run dev
# mobile (in another shell)
cd apps/mobile; npx expo start
```

Pick `flood_dha` in the scenario dropdown but do **not** click Run yet.

---

## Script

**(0:00) Opening — 25s**

> "Urban crises in cities like Karachi unfold in real time. Signals — weather
> alerts, traffic spikes, social posts in mixed Urdu and English, citizen
> reports — exist, but they're scattered. CIRO turns them into coordinated
> decisions."

Show the empty Command Center map centred on DHA.

**(0:25) Trigger the scenario — 20s**

> "I'll run the flood_dha scenario. Ten real-shape signals: weather
> warnings, traffic congestion data, social media posts, and citizen
> reports — all within a 30-minute window across DHA Phase 6."

Click **Run Scenario**. Point at the signal markers populating the map
(weather=blue, traffic=amber, social=violet, citizen=emerald).

**(0:45) Detection — 15s**

> "The DetectionAgent clusters those ten signals into a single incident
> based on space and time. No LLM here — deterministic so it's
> reproducible."

Highlight the new red incident marker and the incident card appearing in
the left sidebar.

**(1:00) Analysis (Gemini) — 30s**

> "The AnalysisAgent takes the cluster, asks Gemini 2.5 Pro to classify
> the situation — type, severity, confidence, affected population — using
> structured output. The schema enforces the shape; we never parse free
> text."

Open the side detail panel, read the reasoning sentence aloud.

**(1:30) Planning (Gemini) — 30s**

> "The PlanningAgent generates a coordinated action plan. Reroute traffic,
> dispatch rescue, alert citizens, deploy water pumps, broadcast warning —
> with priorities and dependencies. Again structured output, so each
> action is a typed object the next agent can act on."

Switch to the **Agent Graph** view briefly to show six agents wired
together, then back to Command Center.

**(2:00) Simulation — 45s**

> "The SimulationAgent executes the plan against mock tools. Watch the map."

Point to:
- The cyan rerouted polyline rendered on the map.
- The emergency ticket showing in the event feed.
- The alert delivery count in the agent trace.

Open mobile — show the Citizen tab with the new alert banner; open the
Responder tab to show the action queue with the same actions that the
operator sees.

**(2:45) Impact — 30s**

> "The ImpactAgent computes before-vs-after metrics deterministically and
> Gemini writes the after-action narrative."

Read the impact panel: travel time improvement %, vehicles rescued,
alert coverage %, and the narrative paragraph.

**(3:15) Citizen submission — 30s**

Switch to mobile, tap **Report an Issue**, type:

> "Roundabout pe pani aur bhi bhar gaya hai, pedestrian fans gaya hai"

Tap **Use my location**, then **Submit**. The signal is canonicalized via
Gemini; show the structured_data block returned.

**(3:45) Wrap — 15s**

> "Six agents. Multi-source input. Live agent trace, deterministic
> simulation, LLM reasoning where it matters. Mobile + web, one
> orchestrator, one event log."

Show the agent graph one last time.

---

## What to point at if asked about Antigravity

- Gemini-powered agents using **structured output** with Pydantic schemas.
- Six-agent multi-stage pipeline with dependency-aware planning.
- Tool integration: Maps Platform on both web and mobile.
- The event log = full, auditable agent trace.
