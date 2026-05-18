import { useEffect, useRef, useState } from "react";
import { api, wsUrl } from "./api";

interface IncidentLite {
  cluster_id: string;
  status: string;
  candidate: {
    cluster_id: string;
    signal_count: number;
    geo_centroid: { lat: number; lng: number };
    signals: any[];
  };
  analysis: any;
  plan: any;
  exec_log: any;
  impact: any;
  blocked_polygon: { lat: number; lng: number }[];
}

interface State {
  runId: string | null;
  incidents: IncidentLite[];
  events: any[];
  status: string | null;
  connected: boolean;
  error: string | null;
}

/**
 * Polls the API for the most recently started run, then opens a WebSocket
 * stream for live updates. Used by both Citizen and Responder tabs.
 */
export function useLatestRun(pollMs = 4000) {
  const [state, setState] = useState<State>({
    runId: null,
    incidents: [],
    events: [],
    status: null,
    connected: false,
    error: null,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const knownRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function pickRun() {
      try {
        const runs = await api.listRuns();
        if (cancelled || !runs.length) return;
        runs.sort((a: any, b: any) => (a.started_at < b.started_at ? 1 : -1));
        const latest = runs[0];
        if (latest.run_id !== knownRunIdRef.current) {
          knownRunIdRef.current = latest.run_id;
          setState((s) => ({ ...s, runId: latest.run_id, incidents: [], events: [], status: latest.status }));
        }
      } catch {
        // ignore — API might be offline
      }
    }

    pickRun();
    const handle = setInterval(pickRun, pollMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [pollMs]);

  useEffect(() => {
    if (!state.runId) return;
    const ws = new WebSocket(wsUrl(state.runId));
    wsRef.current = ws;

    ws.onopen = () => setState((s) => ({ ...s, connected: true }));
    ws.onclose = () => setState((s) => ({ ...s, connected: false }));
    ws.onerror = () => setState((s) => ({ ...s, error: "WebSocket error" }));
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "snapshot") {
          const snap = data.data;
          setState((s) => ({
            ...s,
            incidents: snap.incidents,
            events: snap.events,
            status: snap.summary.status,
          }));
        } else if (data.type) {
          setState((s) => applyEvent(s, data));
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => ws.close();
  }, [state.runId]);

  return state;
}

function applyEvent(s: State, ev: any): State {
  const events = [...s.events, ev];
  let incidents = s.incidents;
  const cid: string | undefined = ev.data?.cluster_id;

  if (ev.type === "incident_detected" && ev.data?.bundle) {
    incidents = upsert(incidents, ev.data.bundle);
  } else if (cid) {
    incidents = incidents.map((inc) => {
      if (inc.cluster_id !== cid) return inc;
      switch (ev.type) {
        case "agent_started": {
          const agent = ev.data.agent;
          const status =
            agent === "AnalysisAgent"
              ? "analyzing"
              : agent === "PlanningAgent"
              ? "planning"
              : agent === "SimulationAgent"
              ? "simulating"
              : agent === "ImpactAgent"
              ? "impact"
              : inc.status;
          return { ...inc, status };
        }
        case "analysis_complete":
          return { ...inc, analysis: ev.data.analysis };
        case "planning_complete":
          return { ...inc, plan: ev.data.plan };
        case "execution_event":
          return {
            ...inc,
            exec_log: { events: [...(inc.exec_log?.events ?? []), ev.data.event] },
          };
        case "execution_complete":
          return { ...inc, exec_log: ev.data.exec_log };
        case "impact_complete":
          return { ...inc, impact: ev.data.impact };
        case "incident_complete":
          return ev.data.bundle ? ev.data.bundle : { ...inc, status: "done" };
        default:
          return inc;
      }
    });
  }
  const status =
    ev.type === "scenario_complete"
      ? "completed"
      : ev.type === "scenario_failed"
      ? "failed"
      : s.status;
  return { ...s, events, incidents, status };
}

function upsert<T extends { cluster_id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((i) => i.cluster_id === item.cluster_id);
  if (idx === -1) return [...list, item];
  const out = list.slice();
  out[idx] = item;
  return out;
}
