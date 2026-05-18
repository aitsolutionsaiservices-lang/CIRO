export const colors = {
  bg: "#070b15",
  panel: "#0f172a",
  panelMuted: "#0b1220",
  border: "#1e293b",
  text: "#f8fafc",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  accent: "#22d3ee",
  danger: "#ef4444",
  warn: "#f59e0b",
  ok: "#10b981",
};

export const severityColors = ["#34d399", "#a3e635", "#fbbf24", "#fb923c", "#ef4444"];

export function severityColor(sev?: number | null): string {
  if (typeof sev !== "number") return colors.textDim;
  return severityColors[Math.max(0, Math.min(sev - 1, 4))];
}
