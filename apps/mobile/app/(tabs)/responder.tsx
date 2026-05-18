import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../../src/api";
import { colors, severityColor } from "../../src/theme";
import { useLatestRun } from "../../src/useLatestRun";

export default function ResponderScreen() {
  const run = useLatestRun();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [completed, setCompleted] = useState<Record<string, Set<number>>>({});

  const startDemo = async () => {
    try {
      setStarting(true);
      await api.runScenario({ scenario: "flood_dha" });
    } catch (err: any) {
      console.warn("run failed", err?.message);
    } finally {
      setStarting(false);
    }
  };

  const togglePill = (cid: string, idx: number) => {
    setCompleted((prev) => {
      const set = new Set(prev[cid] ?? []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      return { ...prev, [cid]: set };
    });
  };

  const sortedIncidents = [...run.incidents].sort(
    (a, b) => (b.analysis?.severity ?? 0) - (a.analysis?.severity ?? 0)
  );

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.h1}>Responder Console</Text>
          <Text style={styles.sub}>
            {run.connected ? "Live · streaming" : "Offline — pull a fresh run"}
          </Text>
        </View>
        <Pressable
          onPress={startDemo}
          style={({ pressed }) => [styles.runBtn, (pressed || starting) && { opacity: 0.7 }]}
          disabled={starting}
        >
          <Ionicons name="play" size={14} color="#0b1220" />
          <Text style={styles.runBtnText}>{starting ? "Starting…" : "Run flood_dha"}</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Metric label="Active" value={String(sortedIncidents.filter((i) => i.status !== "done").length)} />
        <Metric label="Resolved" value={String(sortedIncidents.filter((i) => i.status === "done").length)} />
        <Metric label="Run" value={run.runId ? run.runId.replace("run-", "") : "—"} />
      </View>

      {sortedIncidents.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No active incidents. Tap “Run flood_dha” to trigger a demo run.
          </Text>
        </View>
      )}

      {sortedIncidents.map((inc) => {
        const actions = inc.plan?.actions ?? [];
        const done = completed[inc.cluster_id] ?? new Set();
        const totalActions = actions.length;
        const doneActions = done.size;
        return (
          <View key={inc.cluster_id} style={styles.card}>
            <Pressable
              onPress={() => router.push(`/incident/${inc.cluster_id}`)}
              style={styles.cardHeader}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {(inc.analysis?.incident_type ?? "incident").toUpperCase()}
                </Text>
                <Text style={styles.cardSub}>
                  {inc.cluster_id} · {inc.candidate.signal_count} signals · {inc.status}
                </Text>
              </View>
              <View
                style={[
                  styles.sevPill,
                  {
                    backgroundColor: severityColor(inc.analysis?.severity) + "33",
                    borderColor: severityColor(inc.analysis?.severity),
                  },
                ]}
              >
                <Text style={{ color: severityColor(inc.analysis?.severity), fontWeight: "700", fontSize: 11 }}>
                  SEV {inc.analysis?.severity ?? "?"}
                </Text>
              </View>
            </Pressable>

            {totalActions > 0 && (
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>
                  Actions: {doneActions}/{totalActions} executed
                </Text>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${totalActions ? (doneActions / totalActions) * 100 : 0}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {[...actions]
              .sort((a, b) => a.priority - b.priority)
              .map((action: any, idx: number) => {
                const isDone = done.has(idx);
                return (
                  <Pressable
                    key={idx}
                    onPress={() => togglePill(inc.cluster_id, idx)}
                    style={[styles.actionRow, isDone && styles.actionRowDone]}
                  >
                    <Ionicons
                      name={isDone ? "checkbox" : "square-outline"}
                      size={20}
                      color={isDone ? colors.ok : colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.actionType,
                          isDone && { textDecorationLine: "line-through", color: colors.textMuted },
                        ]}
                      >
                        P{action.priority} · {action.type}
                      </Text>
                      {action.parameters?.summary && (
                        <Text
                          style={[
                            styles.actionSummary,
                            isDone && { color: colors.textDim },
                          ]}
                        >
                          {action.parameters.summary}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}

            {inc.impact?.delta_summary && (
              <View style={styles.impactRow}>
                <ImpactStat label="Travel +" value={`${inc.impact.delta_summary.travel_time_improvement_pct ?? 0}%`} />
                <ImpactStat label="Rescued" value={String(inc.impact.delta_summary.vehicles_rescued ?? 0)} />
                <ImpactStat label="Alert cov." value={`${inc.impact.delta_summary.alert_coverage_pct ?? 0}%`} />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { color: colors.text, fontSize: 18, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  runBtnText: { color: "#0b1220", fontWeight: "700", fontSize: 12 },
  metaRow: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  metricValue: { color: colors.text, fontWeight: "700", fontSize: 18 },
  metricLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  emptyCard: {
    marginHorizontal: 14,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 18,
  },
  emptyText: { color: colors.textMuted, textAlign: "center" },
  card: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  cardSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  sevPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  progressRow: { marginTop: 10 },
  progressLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  progressBarBg: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden" },
  progressBarFill: { height: 4, backgroundColor: colors.accent },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  actionRowDone: { opacity: 0.7 },
  actionType: { color: colors.text, fontFamily: "Menlo", fontSize: 12 },
  actionSummary: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  impactRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
