import { useState } from "react";
import type { GeoLocation } from "../types";

export type CrisisIncidentType =
  | "flood"
  | "heatwave"
  | "accident"
  | "infrastructure"
  | "blockage";

const TYPE_OPTIONS: { value: CrisisIncidentType; label: string; emoji: string }[] = [
  { value: "flood", label: "Urban flood", emoji: "🌊" },
  { value: "heatwave", label: "Heatwave", emoji: "🌡️" },
  { value: "accident", label: "Road accident", emoji: "🚧" },
  { value: "infrastructure", label: "Infrastructure failure", emoji: "🏚️" },
  { value: "blockage", label: "Road blockage", emoji: "⛔" },
];

interface Props {
  point: GeoLocation;
  /** When non-null, the modal is in "area" mode and shows polygon-derived metadata */
  areaRadiusKm?: number;
  areaSqKm?: number;
  starting: boolean;
  onSubmit: (params: {
    incident_type: CrisisIncidentType;
    radius_km: number;
    signal_count: number;
    description: string;
  }) => void;
  onClose: () => void;
}

export function CrisisCreatorModal({
  point,
  areaRadiusKm,
  areaSqKm,
  starting,
  onSubmit,
  onClose,
}: Props) {
  const [type, setType] = useState<CrisisIncidentType>("flood");
  const [radius, setRadius] = useState<number>(areaRadiusKm ?? 0.5);
  const [signalCount, setSignalCount] = useState<number>(8);
  const [description, setDescription] = useState<string>("");

  const isArea = areaRadiusKm !== undefined;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-ciroPanel border border-ciroBorder rounded-lg p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-red-400">⚠</span>
              {isArea ? "Report crisis in this area" : "Report crisis at this point"}
            </h2>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              {isArea && areaSqKm !== undefined && (
                <> · {areaSqKm.toFixed(2)} km²</>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Incident type */}
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">
          What kind of crisis?
        </label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setType(opt.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded border text-sm text-left transition ${
                type === opt.value
                  ? "border-cyan-500 bg-cyan-500/10 text-white"
                  : "border-ciroBorder bg-slate-900 text-slate-300 hover:border-slate-600"
              }`}
            >
              <span className="text-xl">{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Radius */}
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">
          Affected radius
          {isArea && <span className="text-slate-400 normal-case font-normal"> (from polygon)</span>}
        </label>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="range"
            min={0.1}
            max={3}
            step={0.1}
            value={radius}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
            className="flex-1 accent-cyan-500"
            disabled={isArea}
          />
          <span className="text-sm font-mono text-slate-200 w-16 text-right">
            {radius.toFixed(1)} km
          </span>
        </div>

        {/* Signal count */}
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">
          Signal density
        </label>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="range"
            min={4}
            max={14}
            step={1}
            value={signalCount}
            onChange={(e) => setSignalCount(parseInt(e.target.value, 10))}
            className="flex-1 accent-cyan-500"
          />
          <span className="text-sm font-mono text-slate-200 w-16 text-right">
            {signalCount} signals
          </span>
        </div>

        {/* Description */}
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-2">
          Description / area name (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='e.g. "Saddar Bazaar" or "near Karachi University main gate"'
          className="w-full bg-slate-900 border border-ciroBorder rounded p-2 text-sm text-slate-200 placeholder-slate-600 mb-5 resize-none"
          rows={2}
        />

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={starting}
            className="px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                incident_type: type,
                radius_km: radius,
                signal_count: signalCount,
                description: description.trim(),
              })
            }
            disabled={starting}
            className="bg-red-500 hover:bg-red-400 disabled:bg-slate-700 disabled:text-slate-400 px-4 py-2 rounded font-semibold text-sm flex items-center gap-2"
          >
            {starting ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Triggering…
              </>
            ) : (
              <>
                <span className="live-dot" />
                Trigger crisis response
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
