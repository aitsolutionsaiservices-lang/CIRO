import { useCallback, useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";

import { api, GOOGLE_MAPS_KEY } from "./api";
import type { ScenarioMeta } from "./types";
import { useRunStream } from "./useRunStream";
import { Header } from "./components/Header";
import { CommandCenter } from "./components/CommandCenter";
import { IncidentDetailPage } from "./components/IncidentDetail";
import { AgentGraphPage } from "./components/AgentGraph";

export default function App() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("flood_dha");
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [healthOk, setHealthOk] = useState(false);
  const stream = useRunStream(runId);
  const navigate = useNavigate();

  useEffect(() => {
    let stop = false;

    const pingHealth = () =>
      api.health()
        .then((h) => !stop && setHealthOk(h.status === "ok"))
        .catch(() => !stop && setHealthOk(false));

    const pingScenarios = () =>
      api.listScenarios()
        .then((s) => {
          if (stop) return;
          setScenarios(s);
          if (s.length && !s.find((x) => x.id === selectedScenario)) {
            setSelectedScenario(s[0].id);
          }
        })
        .catch(() => !stop && setScenarios([]));

    pingHealth();
    pingScenarios();
    // Retry every 4s so the dashboard auto-recovers when the API comes back up.
    const handle = setInterval(() => {
      pingHealth();
      if (scenarios.length === 0) pingScenarios();
    }, 4000);

    return () => {
      stop = true;
      clearInterval(handle);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startRun = useCallback(async () => {
    setStarting(true);
    try {
      const res = await api.runScenario({ scenario: selectedScenario });
      setRunId(res.run_id);
      navigate("/");
    } catch (err) {
      console.error(err);
      alert(`Failed to start scenario: ${err}`);
    } finally {
      setStarting(false);
    }
  }, [selectedScenario, navigate]);

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md bg-ciroPanel border border-ciroBorder rounded-lg p-6 text-center">
          <p className="text-red-400 font-bold mb-2">Missing Google Maps key</p>
          <p className="text-sm text-slate-300">
            Set <code className="bg-slate-800 px-1 rounded">VITE_GOOGLE_MAPS_KEY</code> in{" "}
            <code className="bg-slate-800 px-1 rounded">apps/web/.env.local</code> and restart the
            dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} libraries={["maps", "marker"]}>
      <div className="h-full flex flex-col">
        <Header
          scenarios={scenarios}
          selectedScenario={selectedScenario}
          onScenarioChange={setSelectedScenario}
          onRun={startRun}
          starting={starting}
          runId={runId}
          runStatus={stream.snapshot?.summary.status ?? null}
          healthOk={healthOk}
          incidentsCount={stream.incidents.length}
        />
        <div className="flex-1 min-h-0">
          <Routes>
            <Route
              path="/"
              element={
                <CommandCenter
                  incidents={stream.incidents}
                  events={stream.events}
                  signals={stream.snapshot?.signals ?? []}
                  runId={runId}
                  runStatus={stream.snapshot?.summary.status ?? null}
                />
              }
            />
            <Route
              path="/incidents/:clusterId"
              element={<IncidentDetailPage incidents={stream.incidents} />}
            />
            <Route
              path="/graph"
              element={
                <AgentGraphPage
                  events={stream.events}
                  incidents={stream.incidents}
                />
              }
            />
          </Routes>
        </div>
      </div>
    </APIProvider>
  );
}
