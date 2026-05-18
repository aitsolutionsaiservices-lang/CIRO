import { useEffect, useState } from "react";
import type { CanonicalSignal, IncidentBundle, RunStatus, StreamEvent } from "../types";
import { MapView } from "./MapView";
import { IncidentList } from "./IncidentList";
import { EventFeed } from "./EventFeed";
import { ImpactPanel } from "./ImpactPanel";

interface Props {
  incidents: IncidentBundle[];
  events: StreamEvent[];
  signals: CanonicalSignal[];
  runId: string | null;
  runStatus: RunStatus | null;
}

export function CommandCenter({ incidents, events, signals, runId, runStatus }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  // Auto-select the first incident as soon as it appears
  useEffect(() => {
    if (!selected && incidents.length) {
      setSelected(incidents[0].cluster_id);
    }
  }, [incidents, selected]);

  const selectedIncident =
    incidents.find((i) => i.cluster_id === selected) ?? null;

  return (
    <div className="h-full grid grid-cols-[320px_1fr_360px] grid-rows-[1fr_280px] gap-0 min-h-0">
      {/* Left sidebar — incidents (spans both rows) */}
      <div className="row-span-2 min-h-0 overflow-hidden">
        <IncidentList
          incidents={incidents}
          selectedClusterId={selected}
          onSelect={setSelected}
        />
      </div>

      {/* Main map */}
      <div className="relative min-h-0">
        <MapView
          signals={signals}
          incidents={incidents}
          selectedClusterId={selected}
          onSelectIncident={setSelected}
        />
        {!runId && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/85 backdrop-blur border border-ciroBorder rounded-lg px-6 py-4 text-center pointer-events-auto">
              <div className="text-lg font-semibold">No active run</div>
              <div className="text-sm text-slate-400 mt-1">
                Pick a scenario and click <span className="text-red-400 font-semibold">Run Scenario</span>.
              </div>
            </div>
          </div>
        )}
        {runStatus === "running" && (
          <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur border border-cyan-500/40 rounded px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="live-dot" />
            Live pipeline running
          </div>
        )}
        <MapLegend />
      </div>

      {/* Right sidebar — event feed (spans both rows) */}
      <div className="row-span-2 min-h-0 overflow-hidden">
        <EventFeed events={events} />
      </div>

      {/* Bottom panel — impact / plan */}
      <div className="min-h-0 overflow-hidden">
        <ImpactPanel incident={selectedIncident} />
      </div>
    </div>
  );
}

function MapLegend() {
  const items: { label: string; color: string }[] = [
    { label: "Weather", color: "#60a5fa" },
    { label: "Traffic", color: "#fbbf24" },
    { label: "Social", color: "#a78bfa" },
    { label: "Citizen", color: "#34d399" },
    { label: "Incident", color: "#ef4444" },
    { label: "Reroute", color: "#22d3ee" },
  ];
  return (
    <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur border border-ciroBorder rounded px-3 py-2 flex items-center gap-3 text-xs">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full border border-slate-700"
            style={{ background: it.color }}
          />
          <span className="text-slate-300">{it.label}</span>
        </div>
      ))}
    </div>
  );
}
