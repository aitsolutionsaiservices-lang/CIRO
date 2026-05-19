# CIRO — Demo script (3–5 min video)

Goal: show the full end-to-end loop — multi-source input → detected crisis →
coordinated plan → simulated response → impact — and let the viewer see CIRO
react to **both** canned and ad-hoc crises so it's clear the system isn't a
one-trick demo.

## Setup

Have three windows visible:

1. Web Command Center at <http://localhost:5173>
2. Mobile app on a phone (Expo Go), Citizen tab
3. *(Optional)* Terminal tailing `uvicorn` logs

## Pre-flight (off-camera)

```powershell
# API (auto-reloads on file changes)
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

# Web (path-safe — works even with spaces / & in the folder name)
cd apps\web
node node_modules\vite\bin\vite.js

# Mobile (separate shell)
cd apps\mobile
node node_modules\expo\bin\cli start --lan
```

Open the dashboard at localhost:5173. Confirm the top-right shows **"API healthy"**.

Pre-pick **`DHA Phase 6 urban flooding`** in the scenario dropdown but do **not** click Run yet.

---

## Script

### (0:00) Opening — 25s

> "Urban crises in cities like Karachi, Lahore and Islamabad unfold in real
> time. Signals — weather alerts from PMD, traffic congestion data, social
> posts in mixed Urdu and English, citizen reports from mobile apps — all
> exist, but they're scattered across systems. CIRO turns those scattered
> signals into coordinated decisions in under a minute."

Show the empty Command Center map.

### (0:25) Canned scenario — 25s

> "Let's run a real scenario. The DHA Phase 6 flooding case has ten
> signals — PMD weather stations, traffic cameras, social posts, voice-call
> citizen reports — all within a 30-minute window."

Click **Run Scenario**. Point at the colored signal markers populating the map
(weather=blue, traffic=amber, social=violet, citizen=emerald).

### (0:50) Detection + Analysis — 30s

> "The Detection agent clusters the ten signals into one incident based on
> space and time. Deterministic — no LLM, so it's reproducible. Then Gemini
> takes over: the Analysis agent gives us severity, confidence, affected
> population, and reasoning — all as a typed schema we can route to the
> next agent without parsing prose."

Highlight the red incident marker. Open the bottom Impact panel briefly to show
the analysis reasoning sentence.

### (1:20) Planning + Simulation — 45s

> "The Planning agent — also Gemini — converts the situation into a
> coordinated action plan: reroute traffic, dispatch rescue, alert citizens,
> deploy water pumps, broadcast warning. Each action is a typed object the
> Simulation agent can execute. Watch the map."

Point to:
- Cyan rerouted polyline drawn around the blocked area.
- Emergency dispatch ticket ID landing in the agent trace.
- Alert delivery count rising in the right-hand panel.

Switch to the **Agent Graph** tab for 5 seconds to show all six agents wired
together with status dots, then back to the Command Center.

### (2:05) Impact — 20s

> "Finally the Impact agent computes before-vs-after metrics
> deterministically and Gemini writes a narrative summary."

Read off the bottom panel: travel time improvement %, vehicles rescued, alert
coverage %, narrative paragraph.

### (2:25) Ad-hoc crisis — Pin a point — 35s

> "Demos are one thing — but real operators don't just play scripted
> scenarios. CIRO lets an operator drop a crisis pin anywhere on the map."

Click **📍 Pin crisis** in the header. The map cursor turns to a crosshair.
Click somewhere on the Karachi map *outside* the existing incident — e.g. in
PECHS or Saddar.

> "I'll mark this as a heatwave, half-kilometer radius, ten signals. The
> system will synthesize realistic signals here and run the same pipeline
> live."

Pick **🌡️ Heatwave**, type "Saddar Empress Market" into the description,
click **Trigger crisis response**. Show signals appearing, new incident
forming, the pipeline running again with a fresh Gemini analysis and plan
that's **different** from the flood (rescue + power + medical instead of
reroute + pumps).

### (3:00) Ad-hoc crisis — Draw an area — 30s

Click **✏ Draw area** in the header.

> "An operator can also draw the exact affected area. The radius gets
> computed from the polygon."

Outline a polygon by clicking 4–5 points on the map, then double-click the
last point. The modal opens with the radius pre-filled.

Pick **🚧 Road accident**, click **Trigger crisis response**. Quick callout:
"The new incident gets its own pipeline run — same six agents."

### (3:30) Citizen submission (mobile) — 25s

Switch to the phone, Citizen tab.

> "On the citizen side, anyone can submit a report. Free-form text in Urdu
> or English — Gemini extracts the structured fields."

Tap **Report an issue near me**. Type or speak:

> "Roundabout pe paani bhar gaya, pedestrian fans gaya hai"

Tap **Use my location** then **Submit**. Show the canonicalized signal
returned — `vehicles_stranded`, `people_in_danger`, `urgency`, `language:
ur-en`. All extracted by Gemini structured output.

### (3:55) Multi-scenario variety — 25s

Back on the web, drop the dropdown to show **all four** canned scenarios:

- DHA Phase 6 urban flooding
- Mall Road / Anarkali heatwave
- Islamabad Expressway accident
- Gulshan-e-Iqbal water-main rupture

> "The same pipeline handles floods, heatwaves, accidents, and
> infrastructure failures. Add a new JSON to `infra/seed/` and it shows up
> here — no code changes."

### (4:20) Wrap — 20s

Open the **Agent Graph** view one last time.

> "Six coordinated agents. Multi-source input. Typed schemas at every
> boundary. Live WebSocket trace. Mobile + web, one orchestrator, one
> event log — and a Pin/Draw mode so any operator can throw a fresh
> situation at it. That's CIRO."

Hold on the agent graph until the timer hits ~4:40.

---

## What to point at if a judge asks about Google Antigravity

- **Gemini-powered agents using structured output** — every LLM call goes out with `response_mime_type="application/json"` and a Pydantic schema. We never parse prose.
- **Six-agent multi-stage pipeline** — single-responsibility agents, dependency-aware planning, deterministic detection + simulation.
- **Tool integration via Google Maps Platform** — Maps JS API on the web (markers, polylines, polygons, drawing manager, dark colorScheme), Maps SDK for Android on mobile.
- **The event log = full, auditable agent trace** — stream every step over WebSocket; replay any run from `GET /runs/{id}`.

## Recovery tips during the recording

- If the API briefly disconnects ("API offline" pill), the dashboard auto-recovers within 4 seconds.
- If a Gemini call rate-limits, the run will fail visibly with the error in the right panel; just trigger another scenario.
- If the map shows "For development purposes only" watermark, that's because billing isn't enabled on the Google Cloud project — it doesn't affect functionality, only aesthetics.
