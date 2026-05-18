"""
CIRO FastAPI server.

Endpoints (all JSON unless noted):
    GET  /health
    GET  /scenarios                 List seed scenarios available on disk.
    GET  /scenarios/{name}/preview  Return the raw signals for a seed scenario.
    POST /scenarios/run             Start a run. Body: { "scenario": "flood_dha" } OR { "signals": [...] }.
    GET  /runs                      List all runs (in-memory).
    GET  /runs/{run_id}             Snapshot of one run (signals + incidents + events).
    POST /signals                   Submit a single signal (mobile citizen flow).
                                    Auto-triggers a run if running_run_id is provided.
    WS   /ws/runs/{run_id}          Stream events for a run as they happen.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load .env BEFORE importing agents (they need GEMINI_API_KEY at import time only
# for client construction; the lazy property reads env at call time, but doing this
# early keeps the lifecycle obvious).
ENV_PATH = Path(__file__).resolve().parent / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)

from .agents.ingestion import IngestionAgent  # noqa: E402
from .orchestrator import Orchestrator, RunManager, RunSnapshot, RunSummary  # noqa: E402
from .schemas.models import CanonicalSignal, GeoLocation, SignalSource  # noqa: E402


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("ciro.api")

SEED_DIR = Path(__file__).resolve().parents[2] / "infra" / "seed"


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------


run_manager = RunManager()
orchestrator = Orchestrator(run_manager)
ingestion = IngestionAgent()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("CIRO API starting. Gemini key present: %s", bool(os.getenv("GEMINI_API_KEY")))
    logger.info("Seed dir: %s (exists=%s)", SEED_DIR, SEED_DIR.exists())
    yield
    logger.info("CIRO API stopping.")


app = FastAPI(title="CIRO API", version="0.1.0", lifespan=lifespan)


# CORS — for the hackathon demo we allow everything (regex covers both
# localhost/127.0.0.1 and any LAN IP a phone might use). For production split
# this into an explicit allowlist read from CIRO_CORS_ORIGINS.
explicit_origins = [o.strip() for o in os.getenv("CIRO_CORS_ORIGINS", "").split(",") if o.strip()]
if explicit_origins and "*" not in explicit_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=explicit_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=False,  # required when using wildcard origins
        allow_methods=["*"],
        allow_headers=["*"],
    )


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class RunRequest(BaseModel):
    scenario: Optional[str] = None
    signals: Optional[List[Dict[str, Any]]] = None


class RunStartedResponse(BaseModel):
    run_id: str
    status: str
    scenario: Optional[str] = None
    signal_count: int


class SignalSubmitRequest(BaseModel):
    raw_text: str = Field(min_length=1)
    lat: float
    lng: float
    source: SignalSource = SignalSource.citizen_report
    enrich: bool = True


class SignalSubmitResponse(BaseModel):
    signal: CanonicalSignal
    triggered_run_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_seed(name: str) -> Dict[str, Any]:
    candidate = SEED_DIR / f"{name}.json"
    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Scenario '{name}' not found")
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500, detail=f"Scenario '{name}' is not valid JSON: {exc}"
        )
    if "signals" not in data:
        raise HTTPException(
            status_code=500, detail=f"Scenario '{name}' missing 'signals' field"
        )
    return data


def _list_seed_scenarios() -> List[Dict[str, Any]]:
    if not SEED_DIR.exists():
        return []
    out: List[Dict[str, Any]] = []
    for f in sorted(SEED_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append(
            {
                "id": f.stem,
                "name": data.get("name", f.stem),
                "description": data.get("description", ""),
                "epicenter": data.get("epicenter"),
                "signal_count": len(data.get("signals", [])),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "gemini_key": bool(os.getenv("GEMINI_API_KEY")),
        "model": os.getenv("GEMINI_MODEL", "gemini-2.5-pro"),
    }


@app.get("/scenarios")
def list_scenarios() -> List[Dict[str, Any]]:
    return _list_seed_scenarios()


@app.get("/scenarios/{name}/preview")
def preview_scenario(name: str) -> Dict[str, Any]:
    return _load_seed(name)


@app.post("/scenarios/run", response_model=RunStartedResponse)
async def run_scenario(req: RunRequest) -> RunStartedResponse:
    if req.signals is None and not req.scenario:
        raise HTTPException(status_code=400, detail="Provide either `scenario` or `signals`")

    if req.signals is not None:
        signals = req.signals
        scenario = req.scenario or "custom"
    else:
        data = _load_seed(req.scenario)  # type: ignore[arg-type]
        signals = data["signals"]
        scenario = req.scenario or data.get("name", "seed")

    state = await orchestrator.run(signals, scenario_name=scenario)
    return RunStartedResponse(
        run_id=state.summary.run_id,
        status=state.summary.status,
        scenario=scenario,
        signal_count=len(signals),
    )


@app.get("/runs", response_model=List[RunSummary])
def list_runs() -> List[RunSummary]:
    return run_manager.list_summaries()


@app.get("/runs/{run_id}", response_model=RunSnapshot)
def get_run(run_id: str) -> RunSnapshot:
    state = run_manager.get(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return state.snapshot()


@app.post("/signals", response_model=SignalSubmitResponse)
def submit_signal(req: SignalSubmitRequest) -> SignalSubmitResponse:
    signal = ingestion.ingest_raw(
        text=req.raw_text,
        geo=GeoLocation(lat=req.lat, lng=req.lng),
        source=req.source,
        enrich=req.enrich,
    )
    return SignalSubmitResponse(signal=signal)


@app.websocket("/ws/runs/{run_id}")
async def ws_run_events(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    state = run_manager.get(run_id)
    if state is None:
        await websocket.send_json({"type": "error", "data": {"message": f"Run '{run_id}' not found"}})
        await websocket.close(code=1003)
        return

    # 1) Replay everything we have so far
    cursor = 0
    try:
        await websocket.send_json(
            {
                "type": "snapshot",
                "data": state.snapshot().model_dump(mode="json"),
            }
        )
        cursor = len(state.events)

        # 2) Stream new events as they arrive
        while True:
            new_events = await state.wait_for_event(cursor)
            for ev in new_events:
                await websocket.send_json(ev)
            cursor += len(new_events)
            if state.summary.status != "running" and cursor >= len(state.events):
                # Send a final close marker so the client can stop spinners
                await websocket.send_json(
                    {
                        "type": "stream_end",
                        "data": {"status": state.summary.status, "run_id": run_id},
                    }
                )
                break
    except WebSocketDisconnect:
        logger.info("ws client disconnected from %s", run_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("ws error on %s", run_id)
        try:
            await websocket.send_json({"type": "error", "data": {"message": str(exc)}})
        except Exception:  # noqa: BLE001
            pass
