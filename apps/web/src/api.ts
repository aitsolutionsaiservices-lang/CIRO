import type { RunSnapshot, RunSummary, ScenarioMeta } from "./types";

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";
export const GOOGLE_MAPS_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) ?? "";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () =>
    fetch(`${API_BASE}/health`).then(jsonOrThrow<{ status: string; gemini_key: boolean; model: string }>),

  listScenarios: () => fetch(`${API_BASE}/scenarios`).then(jsonOrThrow<ScenarioMeta[]>),

  previewScenario: (name: string) =>
    fetch(`${API_BASE}/scenarios/${encodeURIComponent(name)}/preview`).then(jsonOrThrow<any>),

  runScenario: (body: { scenario?: string; signals?: any[] }) =>
    fetch(`${API_BASE}/scenarios/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<{ run_id: string; status: string; scenario: string; signal_count: number }>),

  listRuns: () => fetch(`${API_BASE}/runs`).then(jsonOrThrow<RunSummary[]>),

  getRun: (run_id: string) =>
    fetch(`${API_BASE}/runs/${encodeURIComponent(run_id)}`).then(jsonOrThrow<RunSnapshot>),

  submitSignal: (body: {
    raw_text: string;
    lat: number;
    lng: number;
    source?: string;
    enrich?: boolean;
  }) =>
    fetch(`${API_BASE}/signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<any>),
};

export function wsUrl(run_id: string): string {
  const httpBase = API_BASE.replace(/\/$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/ws/runs/${encodeURIComponent(run_id)}`;
}
