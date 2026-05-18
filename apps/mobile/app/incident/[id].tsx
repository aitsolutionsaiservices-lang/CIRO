import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { colors, severityColor } from "../../src/theme";
import { useLatestRun } from "../../src/useLatestRun";

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useLatestRun();
  const incident = run.incidents.find((i) => i.cluster_id === id);

  if (!incident) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textMuted }}>No data for incident {id}</Text>
      </View>
    );
  }

  const analysis = incident.analysis;
  const plan = incident.plan;
  const impact = incident.impact;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>
          {(analysis?.incident_type ?? "Incident").toUpperCase()}
        </Text>
        <Text style={styles.subtitle}>{incident.cluster_id}</Text>
        {analysis && (
          <View style={styles.statsRow}>
            <Stat label="Severity" value={`${analysis.severity}/5`} color={severityColor(analysis.severity)} />
            <Stat label="Confidence" value={`${analysis.confidence_pct}%`} />
            <Stat label="Affected" value={analysis.affected_population.toLocaleString()} />
          </View>
        )}
        {analysis?.reasoning && (
          <Text style={styles.reasoning}>{analysis.reasoning}</Text>
        )}
      </View>

      {plan && (
        <Section title={`Action plan · ${plan.actions.length} steps`}>
          {plan.actions
            .slice()
            .sort((a: any, b: any) => a.priority - b.priority)
            .map((action: any, i: number) => (
              <View key={i} style={styles.actionCard}>
                <Text style={styles.actionType}>
                  P{action.priority} · {action.type}
                </Text>
                {action.parameters?.summary && (
                  <Text style={styles.actionSummary}>{action.parameters.summary}</Text>
                )}
                {action.parameters?.rationale && (
                  <Text style={styles.actionRationale}>{action.parameters.rationale}</Text>
                )}
              </View>
            ))}
        </Section>
      )}

      {incident.exec_log?.events?.length > 0 && (
        <Section title={`Executed · ${incident.exec_log.events.length} events`}>
          {incident.exec_log.events.map((ev: any, i: number) => (
            <View key={i} style={styles.execCard}>
              <Text style={styles.execTool}>{ev.tool}</Text>
              <Text style={styles.execResult}>
                {JSON.stringify(ev.result, null, 2)}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {impact && (
        <Section title="Impact">
          <View style={styles.statsRow}>
            <Stat
              label="Travel +"
              value={`${impact.delta_summary?.travel_time_improvement_pct ?? 0}%`}
              color={colors.ok}
            />
            <Stat
              label="Rescued"
              value={String(impact.delta_summary?.vehicles_rescued ?? 0)}
            />
            <Stat
              label="Alert cov."
              value={`${impact.delta_summary?.alert_coverage_pct ?? 0}%`}
            />
          </View>
          <Text style={styles.narrative}>{impact.narrative}</Text>
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({
  label,
  value,
  color = colors.text,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  title: { color: colors.text, fontWeight: "700", fontSize: 18 },
  subtitle: { color: colors.textMuted, fontFamily: "Menlo", fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: colors.panelMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: { fontWeight: "700", fontSize: 16 },
  statLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2, textTransform: "uppercase" },
  reasoning: { color: colors.text, marginTop: 12, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontWeight: "700", fontSize: 15, marginBottom: 8 },
  actionCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  actionType: { color: colors.accent, fontFamily: "Menlo", fontSize: 12 },
  actionSummary: { color: colors.text, marginTop: 4 },
  actionRationale: { color: colors.textMuted, marginTop: 4, fontSize: 12, fontStyle: "italic" },
  execCard: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  execTool: { color: colors.warn, fontFamily: "Menlo", fontSize: 12 },
  execResult: { color: colors.text, fontFamily: "Menlo", fontSize: 11, marginTop: 4 },
  narrative: { color: colors.text, marginTop: 12, lineHeight: 20 },
});
