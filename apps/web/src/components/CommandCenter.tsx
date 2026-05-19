import { useEffect, useState } from "react";
import type {
  CanonicalSignal,
  GeoLocation,
  IncidentBundle,
  RunStatus,
  StreamEvent,
} from "../types";
import { MapView } from "./MapView";
import { IncidentList } from "./IncidentList";
import { EventFeed } from "./EventFeed";
import { ImpactPanel } from "./ImpactPanel";
import { CrisisCreatorModal } from "./CrisisCreatorModal";
import type { SynthesizeParams } from "../App";

interface Props {
  incidents: IncidentBundle[];
  events: StreamEvent[];
  signals: CanonicalSignal[];
  runId: string | null;
  runStatus: RunStatus | null;
  placeMode: boolean;
  drawMode: boolean;
  starting: boolean;
  onSynthesize: (params: SynthesizeParams) => void | Promise<void>;
  onCancelTools: () => void;
}

interface AdHocSelection {
  point: GeoLocation;
  radius_km?: number; // when set, treat as area mode
  area_sqkm?: number;
}

export function CommandCenter({
  incidents,
  events,
  signals,
  runId,
  runStatus,
  placeMode,
  drawMode,
  starting,
  onSynthesize,
  onCancelTools,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [adHoc, setAdHoc] = useState<AdHocSelection | null>(null);

  // Auto-select the first incident as soon as it appears
  useEffect(() => {
    if (!selected && incidents.length) {
      setSelected(incidents[0].cluster_id);
    }
  }, [incidents, selected]);

  const selectedIncident = incidents.find((i) => i.cluster_id === selected) ?? null;

  return (
    <div className="h-full grid grid-cols-[320px_1fr_360px] grid-rows-[1fr_280px] gap-0 min-h-0">
      <div className="row-span-2 min-h-0 overflow-hidden">
        <IncidentList
          incidents={incidents}
          selectedClusterId={selected}
          onSelect={setSelected}
        />
      </div>

      <div className="relative min-h-0">
        <MapView
          signals={signals}
          incidents={incidents}
          selectedClusterId={selected}
          onSelectIncident={setSelected}
          placeMode={placeMode}
          drawMode={drawMode}
          onMapPointPicked={(latLng) => setAdHoc({ point: latLng })}
          onPolygonComplete={(centroid, radius_km, area_sqkm) =>
            setAdHoc({ point: centroid, radius_km, area_sqkm })
          }
        />
        {!runId && !placeMode && !drawMode && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/85 backdrop-blur border border-ciroBorder rounded-lg px-6 py-4 text-center pointer-events-auto max-w-sm">
              <div className="text-lg font-semibold">No active run</div>
              <div className="text-sm text-slate-400 mt-1">
                Pick a scenario and click <span className="text-red-400 font-semibold">Run Scenario</span>,
                <br />
                or use <span className="text-cyan-300">📍 Pin crisis</span> /{" "}
                <span className="text-cyan-300">✏ Draw area</span> to create one.
              </div>
            </div>
          </div>
        )}
        {placeMode && (
          <ModeBanner>
            <strong>Pin crisis mode</strong> — click anywhere on the map to drop a crisis pin.
            <button onClick={onCancelTools} className="ml-3 underline">Cancel</button>
          </ModeBanner>
        )}
        {drawMode && (
          <ModeBanner>
            <strong>Draw area mode</strong> — click points to outline a polygon. Double-click the last point to finish.
            <button onClick={onCancelTools} className="ml-3 underline">Cancel</button>
          </ModeBanner>
        )}
        {runStatus === "running" && !placeMode && !drawMode && (
          <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur border border-cyan-500/40 rounded px-3 py-1.5 text-xs flex items-center gap-2">
            <span className="live-dot" />
            Live pipeline running
          </div>
        )}
        <MapLegend />

        {adHoc && (
          <CrisisCreatorModal
            point={adHoc.point}
            areaRadiusKm={adHoc.radius_km}
            areaSqKm={adHoc.area_sqkm}
            starting={starting}
            onSubmit={async ({ incident_type, radius_km, signal_count, description }) => {
              await onSynthesize({
                center: adHoc.point,
                incident_type,
                radius_km,
                signal_count,
                description: description || undefined,
              });
              setAdHoc(null);
            }}
            onClose={() => setAdHoc(null)}
          />
        )}
      </div>

      <div className="row-span-2 min-h-0 overflow-hidden">
        <EventFeed events={events} />
      </div>

      <div className="min-h-0 overflow-hidden">
        <ImpactPanel incident={selectedIncident} />
      </div>
    </div>
  );
}

function ModeBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-cyan-500/15 border-cyan-500/50 text-cyan-100 backdrop-blur border rounded px-3 py-1.5 text-xs flex items-center gap-2 z-10">
      <span className="live-dot" />
      <span>{children}</span>
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
