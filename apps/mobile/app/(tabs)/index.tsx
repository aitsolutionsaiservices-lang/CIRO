import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import MapView, { Marker, PROVIDER_GOOGLE, Polygon, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";

import { colors, severityColor } from "../../src/theme";
import { useLatestRun } from "../../src/useLatestRun";

const DEFAULT_REGION: Region = {
  latitude: 24.8007,
  longitude: 67.0731,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const SOURCE_COLORS: Record<string, string> = {
  weather: "#60a5fa",
  traffic: "#fbbf24",
  social: "#a78bfa",
  citizen_report: "#34d399",
};

export default function CitizenScreen() {
  const run = useLatestRun();
  const router = useRouter();
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [perm, setPerm] = useState<"granted" | "denied" | "pending">("pending");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPerm(status === "granted" ? "granted" : "denied");
      if (status === "granted") {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setLocation(loc.coords);
        } catch {
          // ignore — user can still submit a report without GPS
        }
      }
    })();
  }, []);

  const region: Region = location
    ? {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }
    : DEFAULT_REGION;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await new Promise((r) => setTimeout(r, 600));
            setRefreshing(false);
          }}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.alertBanner}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={[
              styles.dot,
              { backgroundColor: run.incidents.length ? colors.danger : colors.textDim },
            ]}
          />
          <Text style={styles.alertText}>
            {run.incidents.length === 0
              ? "No active alerts in your area."
              : `${run.incidents.length} active alert${
                  run.incidents.length === 1 ? "" : "s"
                } near you`}
          </Text>
        </View>
        {run.connected && <Text style={styles.alertSubText}>Live · streaming</Text>}
      </View>

      <View style={styles.mapWrap}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          showsUserLocation={perm === "granted"}
          customMapStyle={DARK_MAP_STYLE}
        >
          {run.incidents.map((inc) =>
            inc.blocked_polygon?.length ? (
              <Polygon
                key={`poly-${inc.cluster_id}`}
                coordinates={inc.blocked_polygon.map((p) => ({
                  latitude: p.lat,
                  longitude: p.lng,
                }))}
                strokeColor={severityColor(inc.analysis?.severity)}
                strokeWidth={2}
                fillColor={severityColor(inc.analysis?.severity) + "44"}
              />
            ) : null
          )}
          {run.incidents.map((inc) => (
            <Marker
              key={`m-${inc.cluster_id}`}
              coordinate={{
                latitude: inc.candidate.geo_centroid.lat,
                longitude: inc.candidate.geo_centroid.lng,
              }}
              pinColor={severityColor(inc.analysis?.severity)}
              title={inc.analysis?.incident_type ?? "Incident"}
              description={`sev ${inc.analysis?.severity ?? "?"}/5 · ${inc.candidate.signal_count} signals`}
              onCalloutPress={() => router.push(`/incident/${inc.cluster_id}`)}
            />
          ))}
        </MapView>
      </View>

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/report",
            params: location
              ? {
                  lat: String(location.latitude),
                  lng: String(location.longitude),
                }
              : undefined,
          })
        }
        style={({ pressed }) => [styles.reportBtn, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="megaphone-outline" size={22} color="#0b1220" />
        <Text style={styles.reportBtnText}>Report an issue near me</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Active alerts</Text>
      {run.incidents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No active crises detected. Pull to refresh.
          </Text>
        </View>
      ) : (
        run.incidents.map((inc) => (
          <Pressable
            key={inc.cluster_id}
            onPress={() => router.push(`/incident/${inc.cluster_id}`)}
            style={styles.alertCard}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.alertCardTitle}>
                {(inc.analysis?.incident_type ?? "Incident").toUpperCase()}
              </Text>
              <Text style={styles.alertCardMeta}>
                severity {inc.analysis?.severity ?? "?"}/5 · status{" "}
                {inc.status}
              </Text>
              {inc.analysis?.reasoning && (
                <Text numberOfLines={2} style={styles.alertCardBody}>
                  {inc.analysis.reasoning}
                </Text>
              )}
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
              <Text
                style={{
                  color: severityColor(inc.analysis?.severity),
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                SEV {inc.analysis?.severity ?? "?"}
              </Text>
            </View>
          </Pressable>
        ))
      )}

      {!run.runId && (
        <View style={styles.emptyCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.emptyText, { marginTop: 8 }]}>
            Looking for an active operations run…
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  alertBanner: {
    backgroundColor: colors.panel,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  alertText: { color: colors.text, fontWeight: "600", fontSize: 14 },
  alertSubText: { color: colors.textMuted, fontSize: 11 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mapWrap: {
    margin: 14,
    height: 260,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1 },
  reportBtn: {
    marginHorizontal: 14,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  reportBtnText: { color: "#0b1220", fontWeight: "700", fontSize: 15 },
  sectionTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: 14,
  },
  emptyCard: {
    marginHorizontal: 14,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 18,
    alignItems: "center",
  },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  alertCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  alertCardTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  alertCardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  alertCardBody: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  sevPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
});

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c1a2e" }] },
];
