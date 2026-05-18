import type { IncidentBundle } from "../types";

interface Props {
  incident: IncidentBundle | null;
}

const PIPELINE_STEPS = [
  { key: "detected", label: "Detected" },
  { key: "analyzing", label: "Analyzed" },
  { key: "planning", label: "Planned" },
  { key: "simulating", label: "Executed" },
  { key: "impact", label: "Impact" },
  { key: "done", label: "Done" },
];

export function ImpactPanel({ incident }: Props) {
  if (!incident) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500 border-t border-ciroBorder bg-ciroPanel/70 px-4">
        Select an incident to inspect plan, execution and impact.
      </div>
    );
  }

  const stepIndex = PIPELINE_STEPS.findIndex((s) => s.key === incident.status);
  const before = incident.impact?.before_metrics ?? {};
  const after = incident.impact?.after_metrics ?? {};
  const delta = incident.impact?.delta_summary ?? {};

  return (
    <div className="h-full overflow-y-auto border-t border-ciroBorder bg-ciroPanel/70">
      <div className="px-4 py-3 border-b border-ciroBorder flex items-center gap-4">
        <div>
          <div className="font-semibold text-sm">
            {incident.analysis?.incident_type ?? "incident"} · {incident.cluster_id}
          </div>
          <div className="text-xs text-slate-400">
            severity {incident.analysis?.severity ?? "?"}/5 · confidence{" "}
            {incident.analysis?.confidence_pct ?? "?"}%
          </div>
        </div>
        <div className="flex-1 flex items-center gap-1">
          {PIPELINE_STEPS.map((step, i) => {
            const reached = i <= stepIndex;
            const active = i === stepIndex && incident.status !== "done";
            return (
              <div key={step.key} className="flex-1 flex items-center gap-1">
                <div className="flex-1">
                  <div
                    className={`h-1.5 rounded ${
                      active
                        ? "bg-cyan-400 animate-pulse"
                        : reached
                        ? "bg-emerald-400"
                        : "bg-slate-700"
                    }`}
                  />
                  <div className="text-[10px] text-slate-400 mt-1 text-center uppercase tracking-wider">
                    {step.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <BeforeAfterCard
          title="Avg travel time"
          before={before.avg_travel_time_min}
          after={after.avg_travel_time_min}
          unit="min"
          improvement="lower"
        />
        <BeforeAfterCard
          title="Stranded vehicles"
          before={before.stranded_vehicles}
          after={after.stranded_vehicles}
          improvement="lower"
        />
        <BeforeAfterCard
          title="Alerted population"
          before={before.alerted_population_pct}
          after={after.alerted_population_pct}
          unit="%"
          improvement="higher"
        />
      </div>

      {incident.impact?.narrative && (
        <div className="px-4 py-3 border-t border-ciroBorder bg-slate-900/60">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            After-action narrative
          </div>
          <div className="text-sm text-slate-200 leading-relaxed">
            {incident.impact.narrative}
          </div>
        </div>
      )}

      {incident.plan && (
        <div className="px-4 py-3 border-t border-ciroBorder">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Action plan ({incident.plan.actions.length})
          </div>
          <div className="space-y-1.5">
            {incident.plan.actions
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((action, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-sm bg-slate-900 border border-ciroBorder rounded px-3 py-2"
                >
                  <span className="text-[10px] text-slate-500 mt-1 font-mono">
                    P{action.priority}
                  </span>
                  <div className="flex-1">
                    <div className="font-mono text-cyan-300 text-xs">{action.type}</div>
                    <div className="text-xs text-slate-300">{action.parameters?.summary}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BeforeAfterCard({
  title,
  before,
  after,
  unit = "",
  improvement,
}: {
  title: string;
  before: any;
  after: any;
  unit?: string;
  improvement: "higher" | "lower";
}) {
  const beforeNum = typeof before === "number" ? before : null;
  const afterNum = typeof after === "number" ? after : null;
  let delta: number | null = null;
  if (beforeNum !== null && afterNum !== null) {
    delta = afterNum - beforeNum;
  }
  const isGood =
    delta === null
      ? null
      : (improvement === "higher" && delta > 0) ||
        (improvement === "lower" && delta < 0);

  return (
    <div className="bg-slate-900 border border-ciroBorder rounded p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-mono font-semibold">
          {afterNum ?? "—"}
          {unit && <span className="text-sm text-slate-400 ml-0.5">{unit}</span>}
        </div>
        {delta !== null && (
          <div
            className={`text-xs font-mono ${
              isGood ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
            {unit}
          </div>
        )}
      </div>
      <div className="text-xs text-slate-500 mt-1 font-mono">
        was {beforeNum ?? "—"}
        {unit}
      </div>
    </div>
  );
}
