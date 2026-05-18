import { useEffect, useReducer, useRef } from "react";
import type {
  IncidentBundle,
  RunSnapshot,
  StreamEvent,
  ActionPlan,
  ExecutionEvent,
  ExecutionLog,
  ImpactReport,
  SituationAnalysis,
} from "./types";
import { wsUrl } from "./api";

interface State {
  snapshot: RunSnapshot | null;
  events: StreamEvent[];
  incidents: Record<string, IncidentBundle>;
  connected: boolean;
  ended: boolean;
  error: string | null;
}

type Action =
  | { kind: "snapshot"; data: RunSnapshot }
  | { kind: "event"; data: StreamEvent }
  | { kind: "connected"; value: boolean }
  | { kind: "ended" }
  | { kind: "error"; message: string }
  | { kind: "reset" };

function applyEvent(
  incidents: Record<string, IncidentBundle>,
  event: StreamEvent
): Record<string, IncidentBundle> {
  const cid = event.data?.cluster_id as string | undefined;

  if (event.type === "incident_detected" && event.data?.bundle) {
    const bundle = event.data.bundle as IncidentBundle;
    return { ...incidents, [bundle.cluster_id]: bundle };
  }
  if (!cid || !incidents[cid]) return incidents;
  const prev = incidents[cid];
  const next = { ...prev };

  switch (event.type) {
    case "agent_started": {
      // map agent name → status
      const agent = event.data?.agent as string | undefined;
      if (agent === "AnalysisAgent") next.status = "analyzing";
      else if (agent === "PlanningAgent") next.status = "planning";
      else if (agent === "SimulationAgent") next.status = "simulating";
      else if (agent === "ImpactAgent") next.status = "impact";
      break;
    }
    case "analysis_complete":
      next.analysis = event.data.analysis as SituationAnalysis;
      break;
    case "planning_complete":
      next.plan = event.data.plan as ActionPlan;
      break;
    case "execution_event": {
      const ev = event.data.event as ExecutionEvent;
      const cur = next.exec_log?.events ?? [];
      next.exec_log = { events: [...cur, ev] };
      break;
    }
    case "execution_complete":
      next.exec_log = event.data.exec_log as ExecutionLog;
      break;
    case "impact_complete":
      next.impact = event.data.impact as ImpactReport;
      break;
    case "incident_complete":
      next.status = "done";
      if (event.data?.bundle) {
        return { ...incidents, [cid]: event.data.bundle as IncidentBundle };
      }
      break;
  }
  return { ...incidents, [cid]: next };
}

function reducer(state: State, action: Action): State {
  switch (action.kind) {
    case "snapshot": {
      const map: Record<string, IncidentBundle> = {};
      for (const b of action.data.incidents) map[b.cluster_id] = b;
      return {
        ...state,
        snapshot: action.data,
        events: action.data.events,
        incidents: map,
      };
    }
    case "event":
      return {
        ...state,
        events: [...state.events, action.data],
        incidents: applyEvent(state.incidents, action.data),
      };
    case "connected":
      return { ...state, connected: action.value };
    case "ended":
      return { ...state, ended: true };
    case "error":
      return { ...state, error: action.message };
    case "reset":
      return {
        snapshot: null,
        events: [],
        incidents: {},
        connected: false,
        ended: false,
        error: null,
      };
    default:
      return state;
  }
}

export function useRunStream(runId: string | null) {
  const [state, dispatch] = useReducer(reducer, {
    snapshot: null,
    events: [],
    incidents: {},
    connected: false,
    ended: false,
    error: null,
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!runId) return;
    dispatch({ kind: "reset" });
    const ws = new WebSocket(wsUrl(runId));
    wsRef.current = ws;

    ws.onopen = () => dispatch({ kind: "connected", value: true });
    ws.onclose = () => dispatch({ kind: "connected", value: false });
    ws.onerror = () => dispatch({ kind: "error", message: "WebSocket error" });
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "snapshot") {
          dispatch({ kind: "snapshot", data: data.data as RunSnapshot });
        } else if (data.type === "stream_end") {
          dispatch({ kind: "ended" });
        } else if (data.type === "error") {
          dispatch({ kind: "error", message: data.data?.message ?? "unknown" });
        } else if (data.type) {
          dispatch({ kind: "event", data: data as StreamEvent });
        }
      } catch (err) {
        console.error("ws parse failed", err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [runId]);

  const incidents = Object.values(state.incidents);
  return { ...state, incidents };
}
