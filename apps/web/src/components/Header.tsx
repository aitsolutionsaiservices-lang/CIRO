import { Link, useLocation } from "react-router-dom";
import type { RunStatus, ScenarioMeta } from "../types";

interface Props {
  scenarios: ScenarioMeta[];
  selectedScenario: string;
  onScenarioChange: (id: string) => void;
  onRun: () => void;
  starting: boolean;
  runId: string | null;
  runStatus: RunStatus | null;
  healthOk: boolean;
  incidentsCount: number;
}

export function Header({
  scenarios,
  selectedScenario,
  onScenarioChange,
  onRun,
  starting,
  runId,
  runStatus,
  healthOk,
  incidentsCount,
}: Props) {
  const location = useLocation();

  return (
    <header className="border-b border-ciroBorder bg-ciroPanel/80 backdrop-blur px-4 py-3 flex items-center gap-4 z-20">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-red-500 flex items-center justify-center font-bold">
          C
        </div>
        <div>
          <div className="font-semibold leading-tight">CIRO</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
            Crisis Intel · Response Orchestrator
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 ml-4">
        <NavLink to="/" active={location.pathname === "/"}>
          Command Center
        </NavLink>
        <NavLink to="/graph" active={location.pathname === "/graph"}>
          Agent Graph
        </NavLink>
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              healthOk ? "bg-emerald-400" : "bg-slate-600"
            }`}
          />
          {healthOk ? "API healthy" : "API offline"}
        </div>
        {runId && (
          <div className="flex items-center gap-2 text-xs">
            <StatusPill status={runStatus} />
            <span className="text-slate-400 font-mono">{runId}</span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-300">{incidentsCount} incident{incidentsCount === 1 ? "" : "s"}</span>
          </div>
        )}
        <select
          value={selectedScenario}
          onChange={(e) => onScenarioChange(e.target.value)}
          className="bg-slate-800 border border-ciroBorder rounded px-2 py-1.5 text-sm"
        >
          {scenarios.length === 0 && <option value="flood_dha">flood_dha</option>}
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={onRun}
          disabled={starting}
          className="bg-red-500 hover:bg-red-400 disabled:bg-slate-700 disabled:text-slate-400 px-4 py-1.5 rounded font-semibold text-sm transition flex items-center gap-2"
        >
          {starting ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <span className="live-dot" />
              Run Scenario
            </>
          )}
        </button>
      </div>
    </header>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded text-sm transition ${
        active
          ? "bg-slate-700 text-white"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      }`}
    >
      {children}
    </Link>
  );
}

function StatusPill({ status }: { status: RunStatus | null }) {
  if (!status) return null;
  const colors: Record<RunStatus, string> = {
    running: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    failed: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${colors[status]}`}
    >
      {status}
    </span>
  );
}
