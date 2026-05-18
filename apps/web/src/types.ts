// Mirrors apps/api/schemas/*.py and the orchestrator's IncidentBundle.
// Kept loose (string types instead of strict literals) so we degrade gracefully
// if the backend adds new fields.

export type SignalSource = "weather" | "traffic" | "social" | "citizen_report";

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface CanonicalSignal {
  timestamp: string;
  geo: GeoLocation;
  source: SignalSource;
  raw_text: string;
  structured_data: Record<string, unknown>;
}

export type IncidentType = "flood" | "heatwave" | "accident" | "infrastructure" | "blockage";

export interface SituationAnalysis {
  incident_type: IncidentType;
  severity: number;
  confidence_pct: number;
  affected_population: number;
  reasoning: string;
}

export interface Action {
  type: string;
  priority: number;
  parameters: Record<string, any>;
}

export interface ActionPlan {
  actions: Action[];
  dependencies: Record<string, string[]>;
  estimated_duration: number;
}

export interface ExecutionEvent {
  timestamp: string;
  tool: string;
  result: Record<string, any>;
}

export interface ExecutionLog {
  events: ExecutionEvent[];
}

export interface ImpactReport {
  before_metrics: Record<string, any>;
  after_metrics: Record<string, any>;
  delta_summary: Record<string, any>;
  narrative: string;
}

export interface CandidateIncident {
  cluster_id: string;
  signals: CanonicalSignal[];
  geo_centroid: GeoLocation;
  signal_count: number;
}

export type IncidentStatus =
  | "detected"
  | "analyzing"
  | "planning"
  | "simulating"
  | "impact"
  | "done";

export interface IncidentBundle {
  cluster_id: string;
  status: IncidentStatus;
  candidate: CandidateIncident;
  blocked_polygon: GeoLocation[];
  analysis: SituationAnalysis | null;
  plan: ActionPlan | null;
  exec_log: ExecutionLog | null;
  impact: ImpactReport | null;
}

export type RunStatus = "running" | "completed" | "failed";

export interface RunSummary {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  error: string | null;
  signal_count: number;
  incident_count: number;
}

export interface RunSnapshot {
  summary: RunSummary;
  signals: CanonicalSignal[];
  incidents: IncidentBundle[];
  events: StreamEvent[];
}

export interface StreamEvent {
  ts: string;
  run_id: string;
  type: string;
  data: Record<string, any>;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  epicenter?: GeoLocation & { label?: string };
  signal_count: number;
}
