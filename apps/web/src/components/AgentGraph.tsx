import { useMemo } from "react";
import type { IncidentBundle, StreamEvent } from "../types";

interface Props {
  events: StreamEvent[];
  incidents: IncidentBundle[];
}

const AGENT_PIPELINE = [
  { key: "ingestion", label: "Ingestion", description: "Normalize raw signals" },
  { key: "detection", label: "Detection", description: "Spatiotemporal clustering" },
  { key: "analysis", label: "Analysis", description: "Severity & reasoning (Gemini)" },
  { key: "planning", label: "Planning", description: "Coordinated action plan (Gemini)" },
  { key: "simulation", label: "Simulation", description: "Execute mock tools" },
  { key: "impact", label: "Impact", description: "Before/after + narrative (Gemini)" },
];

const EVENT_TO_AGENT: Record<string, string> = {
  ingestion_complete: "ingestion",
  incident_detected: "detection",
  analysis_complete: "analysis",
  planning_complete: "planning",
  execution_event: "simulation",
  execution_complete: "simulation",
  impact_complete: "impact",
};

export function AgentGraphPage({ events, incidents }: Props) {
  const agentStats = useMemo(() => {
    const stats: Record<string, { count: number; lastTs: string | null }> = {};
    for (const step of AGENT_PIPELINE) {
      stats[step.key] = { count: 0, lastTs: null };
    }
    for (const ev of events) {
      const agent = EVENT_TO_AGENT[ev.type];
      if (agent) {
        stats[agent].count += 1;
        stats[agent].lastTs = ev.ts;
      }
    }
    return stats;
  }, [events]);

  const activeAgents = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const inc of incidents) {
      if (inc.status === "analyzing") (map["analysis"] ??= []).push(inc.cluster_id);
      else if (inc.status === "planning") (map["planning"] ??= []).push(inc.cluster_id);
      else if (inc.status === "simulating") (map["simulation"] ??= []).push(inc.cluster_id);
      else if (inc.status === "impact") (map["impact"] ??= []).push(inc.cluster_id);
    }
    return map;
  }, [incidents]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <h1 className="text-2xl font-semibold">Agent Pipeline</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Six agents coordinate end-to-end. Signals flow left → right. Hover stats reflect the
          current run; live activity indicates which incidents are at each stage right now.
        </p>

        <div className="mt-8 relative">
          <div className="flex items-stretch gap-3 overflow-x-auto pb-4">
            {AGENT_PIPELINE.map((step, idx) => {
              const stats = agentStats[step.key];
              const active = activeAgents[step.key] ?? [];
              const isActive = active.length > 0;
              const hasRun = stats.count > 0;
              return (
                <div key={step.key} className="flex items-center gap-3 flex-shrink-0">
                  <AgentNode
                    label={step.label}
                    description={step.description}
                    count={stats.count}
                    isActive={isActive}
                    hasRun={hasRun}
                    active={active}
                  />
                  {idx < AGENT_PIPELINE.length - 1 && (
                    <div className="flex flex-col items-center">
                      <svg width="40" height="20" className="text-slate-600">
                        <path
                          d="M0 10 L36 10 L30 5 M36 10 L30 15"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Recent agent events</h2>
          <div className="bg-slate-900 border border-ciroBorder rounded divide-y divide-ciroBorder/70 max-h-96 overflow-y-auto">
            {events.slice(-100).reverse().map((ev, i) => (
              <div key={i} className="px-3 py-1.5 text-sm flex items-center gap-3 font-mono">
                <span className="text-xs text-slate-500">
                  {new Date(ev.ts).toLocaleTimeString()}
                </span>
                <span className="text-cyan-300">{ev.type}</span>
                {ev.data?.cluster_id && (
                  <span className="text-slate-500">{String(ev.data.cluster_id)}</span>
                )}
              </div>
            ))}
            {events.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500">
                No events yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentNode({
  label,
  description,
  count,
  isActive,
  hasRun,
  active,
}: {
  label: string;
  description: string;
  count: number;
  isActive: boolean;
  hasRun: boolean;
  active: string[];
}) {
  return (
    <div
      className={`w-48 rounded-lg border p-3 transition ${
        isActive
          ? "border-cyan-500 bg-cyan-500/10"
          : hasRun
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-ciroBorder bg-ciroPanel"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{label}</span>
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isActive ? "bg-cyan-400 animate-pulse" : hasRun ? "bg-emerald-400" : "bg-slate-600"
          }`}
        />
      </div>
      <div className="text-xs text-slate-400 leading-snug min-h-[34px]">{description}</div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-slate-500 flex items-baseline gap-1.5">
        <span className="text-slate-200 font-mono text-sm">{count}</span> events
      </div>
      {active.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {active.map((cid) => (
            <div key={cid} className="text-[10px] font-mono text-cyan-300 truncate">
              ⤳ {cid}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
