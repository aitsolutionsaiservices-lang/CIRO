import { Link } from "react-router-dom";
import type { IncidentBundle } from "../types";

interface Props {
  incidents: IncidentBundle[];
  selectedClusterId: string | null;
  onSelect: (clusterId: string) => void;
}

const INCIDENT_TYPE_ICONS: Record<string, string> = {
  flood: "🌊",
  heatwave: "🌡️",
  accident: "🚧",
  infrastructure: "🏚️",
  blockage: "⛔",
};

const STATUS_LABEL: Record<string, string> = {
  detected: "Detected",
  analyzing: "Analyzing",
  planning: "Planning",
  simulating: "Executing",
  impact: "Assessing",
  done: "Resolved",
};

const SEVERITY_BG = [
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "bg-lime-500/20 text-lime-300 border-lime-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "bg-red-500/20 text-red-300 border-red-500/30",
];

export function IncidentList({ incidents, selectedClusterId, onSelect }: Props) {
  return (
    <div className="h-full flex flex-col bg-ciroPanel border-r border-ciroBorder">
      <div className="px-4 py-3 border-b border-ciroBorder">
        <div className="font-semibold text-sm">Incidents</div>
        <div className="text-xs text-slate-400 mt-0.5">
          {incidents.length === 0
            ? "None detected yet"
            : `${incidents.length} active · ${incidents.filter((i) => i.status === "done").length} resolved`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {incidents.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            Once signals cluster, they appear here.
          </div>
        )}
        {incidents.map((inc) => {
          const sev = inc.analysis?.severity ?? 3;
          const incidentType = inc.analysis?.incident_type ?? "?";
          const selected = inc.cluster_id === selectedClusterId;
          return (
            <button
              key={inc.cluster_id}
              onClick={() => onSelect(inc.cluster_id)}
              className={`w-full text-left px-4 py-3 border-b border-ciroBorder/60 transition ${
                selected ? "bg-slate-800" : "hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="text-xl leading-none">
                  {INCIDENT_TYPE_ICONS[incidentType] ?? "❓"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm capitalize">
                      {incidentType}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border ${
                        SEVERITY_BG[Math.max(0, Math.min(sev - 1, 4))]
                      }`}
                    >
                      sev {sev}/5
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono truncate">
                    {inc.cluster_id}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={inc.status} />
                    <span className="text-[10px] text-slate-500">
                      {inc.candidate.signal_count} signals
                    </span>
                  </div>
                  {inc.analysis && (
                    <div className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                      {inc.analysis.reasoning}
                    </div>
                  )}
                  <Link
                    to={`/incidents/${encodeURIComponent(inc.cluster_id)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 mt-1.5 inline-block"
                  >
                    Open detail →
                  </Link>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isDone = status === "done";
  const isActive = !isDone;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
        isDone
          ? "bg-emerald-500/20 text-emerald-300"
          : isActive
          ? "bg-cyan-500/20 text-cyan-300 animate-pulse-fast"
          : "bg-slate-700 text-slate-300"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
