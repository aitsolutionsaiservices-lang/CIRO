import { Link, useParams } from "react-router-dom";
import type { IncidentBundle } from "../types";

interface Props {
  incidents: IncidentBundle[];
}

export function IncidentDetailPage({ incidents }: Props) {
  const { clusterId } = useParams<{ clusterId: string }>();
  const incident = incidents.find((i) => i.cluster_id === clusterId);

  if (!incident) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <div className="text-center">
          <div className="mb-3">No data for incident <code className="font-mono">{clusterId}</code>.</div>
          <Link to="/" className="text-cyan-400 hover:text-cyan-300">
            ← back to Command Center
          </Link>
        </div>
      </div>
    );
  }

  const analysis = incident.analysis;
  const plan = incident.plan;
  const exec = incident.exec_log;
  const impact = incident.impact;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <Link to="/" className="text-cyan-400 hover:text-cyan-300 text-sm">
          ← Command Center
        </Link>

        <h1 className="mt-3 text-2xl font-semibold flex items-center gap-3">
          {analysis?.incident_type ?? "Incident"}{" "}
          <span className="text-sm font-mono text-slate-400">{incident.cluster_id}</span>
        </h1>
        {analysis && (
          <div className="text-sm text-slate-300 mt-1">
            severity {analysis.severity}/5 · confidence {analysis.confidence_pct}% · ~
            {analysis.affected_population.toLocaleString()} affected
          </div>
        )}

        {/* Signals */}
        <Section title="Signals" subtitle={`${incident.candidate.signal_count} clustered`}>
          <div className="space-y-2">
            {incident.candidate.signals.map((s, i) => (
              <div
                key={i}
                className="bg-slate-900 border border-ciroBorder rounded px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                  <span className="font-mono text-cyan-300">{s.source}</span>
                  <span>·</span>
                  <span>{new Date(s.timestamp).toLocaleString()}</span>
                  <span>·</span>
                  <span>
                    {s.geo.lat.toFixed(4)},{s.geo.lng.toFixed(4)}
                  </span>
                </div>
                <div className="text-slate-200 mt-1">{s.raw_text}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Analysis */}
        {analysis && (
          <Section title="Situation analysis" subtitle="from AnalysisAgent">
            <div className="bg-slate-900 border border-ciroBorder rounded p-4 text-sm text-slate-200 leading-relaxed">
              {analysis.reasoning}
            </div>
          </Section>
        )}

        {/* Plan */}
        {plan && (
          <Section
            title="Action plan"
            subtitle={`${plan.actions.length} actions · ETA ${plan.estimated_duration} min`}
          >
            <div className="space-y-2">
              {plan.actions
                .slice()
                .sort((a, b) => a.priority - b.priority)
                .map((action, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900 border border-ciroBorder rounded p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">
                        priority {action.priority}
                      </span>
                      <span className="font-mono text-cyan-300">{action.type}</span>
                    </div>
                    {action.parameters?.summary && (
                      <div className="mt-1 text-slate-200">{action.parameters.summary}</div>
                    )}
                    {action.parameters?.rationale && (
                      <div className="mt-1 text-xs text-slate-400 italic">
                        {action.parameters.rationale}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </Section>
        )}

        {/* Execution */}
        {exec && exec.events.length > 0 && (
          <Section title="Execution log" subtitle={`${exec.events.length} simulated actions`}>
            <div className="space-y-2">
              {exec.events.map((ev, i) => (
                <div
                  key={i}
                  className="bg-slate-900 border border-ciroBorder rounded p-3 text-sm"
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                    <span className="font-mono text-amber-300">{ev.tool}</span>
                    <span>·</span>
                    <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <pre className="mt-1 text-xs text-slate-300 whitespace-pre-wrap break-all">
                    {JSON.stringify(ev.result, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Impact */}
        {impact && (
          <Section title="Impact report" subtitle="ImpactAgent · before vs after">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <MetricBlock title="Before" data={impact.before_metrics} />
              <MetricBlock title="After" data={impact.after_metrics} />
            </div>
            <div className="bg-slate-900 border border-ciroBorder rounded p-3 text-sm">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Narrative
              </div>
              <div className="text-slate-200">{impact.narrative}</div>
            </div>
          </Section>
        )}

        <div className="h-12" />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function MetricBlock({ title, data }: { title: string; data: Record<string, any> }) {
  return (
    <div className="bg-slate-900 border border-ciroBorder rounded p-3 text-sm">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      <dl className="space-y-1">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-slate-400">{k.replace(/_/g, " ")}</dt>
            <dd className="text-sm font-mono text-slate-200 truncate">
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
