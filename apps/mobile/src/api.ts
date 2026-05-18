import Constants from "expo-constants";

export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ??
  (Constants.expoConfig?.extra?.apiBase as string | undefined) ??
  "http://localhost:8000";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => fetch(`${API_BASE}/health`).then(jsonOrThrow<any>),
  listScenarios: () => fetch(`${API_BASE}/scenarios`).then(jsonOrThrow<any[]>),
  listRuns: () => fetch(`${API_BASE}/runs`).then(jsonOrThrow<any[]>),
  getRun: (runId: string) =>
    fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`).then(jsonOrThrow<any>),
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
  runScenario: (body: { scenario?: string; signals?: any[] }) =>
    fetch(`${API_BASE}/scenarios/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(jsonOrThrow<any>),
};

export function wsUrl(runId: string): string {
  return `${API_BASE.replace(/^http/, "ws")}/ws/runs/${encodeURIComponent(runId)}`;
}
