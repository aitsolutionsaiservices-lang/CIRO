import { useEffect, useRef } from "react";
import type { StreamEvent } from "../types";

const EVENT_COLORS: Record<string, string> = {
  scenario_started: "bg-red-500/20 text-red-300 border-red-500/30",
  ingestion_complete: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  incident_detected: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  agent_started: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  analysis_complete: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  planning_complete: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  execution_event: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  execution_complete: "bg-amber-500/30 text-amber-200 border-amber-500/40",
  impact_complete: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  incident_complete: "bg-emerald-500/30 text-emerald-200 border-emerald-500/40",
  scenario_complete: "bg-emerald-500/30 text-emerald-200 border-emerald-500/40",
  scenario_failed: "bg-red-500/30 text-red-200 border-red-500/40",
};

function summarize(event: StreamEvent): string {
  const d = event.data || {};
  switch (event.type) {
    case "scenario_started":
      return `scenario "${d.scenario}" started · ${d.signal_count_raw} signals`;
    case "ingestion_complete":
      return `${d.signal_count} signals canonicalized`;
    case "incident_detected":
      return `incident ${d.cluster_id} · ${d.signal_count} signals`;
    case "agent_started":
      return `${d.agent} starting on ${d.cluster_id}`;
    case "analysis_complete":
      return `analysis: ${d.analysis?.incident_type} sev ${d.analysis?.severity}/5 (${d.analysis?.confidence_pct}%)`;
    case "planning_complete":
      return `${d.plan?.actions?.length ?? 0} actions planned · ETA ${d.plan?.estimated_duration}min`;
    case "execution_event":
      return `${d.event?.tool} → ${d.event?.result?.status ?? "ok"}`;
    case "execution_complete":
      return `${d.event_count} actions executed`;
    case "impact_complete": {
      const delta = d.impact?.delta_summary || {};
      return `impact assessed · travel +${delta.travel_time_improvement_pct ?? 0}% · alerted ${delta.alert_coverage_pct ?? 0}%`;
    }
    case "incident_complete":
      return `incident ${d.cluster_id} done`;
    case "scenario_complete":
      return `scenario complete`;
    case "scenario_failed":
      return `scenario failed: ${d.error}`;
    default:
      return event.type;
  }
}

export function EventFeed({ events }: { events: StreamEvent[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="h-full flex flex-col bg-ciroPanel border-l border-ciroBorder">
      <div className="px-4 py-3 border-b border-ciroBorder flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="font-semibold text-sm">Agent Trace</span>
        </div>
        <span className="text-xs text-slate-400 font-mono">{events.length}</span>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {events.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            Waiting for events. Click <span className="text-red-400 font-semibold">Run Scenario</span> to begin.
          </div>
        )}
        {[...events].reverse().map((ev, idx) => (
          <div key={ev.ts + idx} className="px-4 py-2.5 border-b border-ciroBorder/60 hover:bg-slate-800/50">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-1.5 py-0.5 rounded-sm text-[10px] uppercase tracking-wider border ${
                  EVENT_COLORS[ev.type] ?? "bg-slate-700 text-slate-300 border-slate-600"
                }`}
              >
                {ev.type.replace(/_/g, " ")}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {new Date(ev.ts).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-sm text-slate-200 leading-snug">{summarize(ev)}</div>
            {ev.data?.cluster_id && (
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{ev.data.cluster_id}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
