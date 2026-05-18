import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";

import { api } from "../src/api";
import { colors } from "../src/theme";

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [text, setText] = useState("");
  const [lat, setLat] = useState<number | null>(params.lat ? Number(params.lat) : null);
  const [lng, setLng] = useState<number | null>(params.lng ? Number(params.lng) : null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
    } catch (e: any) {
      setError(e?.message ?? "could not get location");
    }
  };

  const submit = async () => {
    setError(null);
    if (!text.trim()) {
      setError("Please describe what's happening.");
      return;
    }
    if (lat === null || lng === null) {
      setError("Tap “Use my location” first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitSignal({
        raw_text: text.trim(),
        lat,
        lng,
        source: "citizen_report",
        enrich: true,
      });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? "submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.label}>What's happening near you?</Text>
      <TextInput
        style={styles.textarea}
        multiline
        numberOfLines={5}
        placeholder='e.g. "Khayaban-e-Ittehad pe pani bhar gaya hai, gaariyan phans gayi hain"'
        placeholderTextColor={colors.textDim}
        value={text}
        onChangeText={setText}
      />

      <Text style={[styles.label, { marginTop: 18 }]}>Location</Text>
      <View style={styles.locRow}>
        <Pressable onPress={fetchLocation} style={styles.locBtn}>
          <Text style={styles.locBtnText}>Use my location</Text>
        </Pressable>
        <Text style={styles.locText}>
          {lat !== null && lng !== null
            ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
            : "not set"}
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          (pressed || submitting) && { opacity: 0.85 },
        ]}
        onPress={submit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#0b1220" />
        ) : (
          <Text style={styles.submitText}>Submit report</Text>
        )}
      </Pressable>

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Report received ✓</Text>
          <Text style={styles.resultText}>
            Your report has been canonicalized and tagged. CIRO will cluster it with
            related signals.
          </Text>
          <Text style={styles.kvKey}>Source</Text>
          <Text style={styles.kvVal}>{result.signal?.source}</Text>
          <Text style={styles.kvKey}>Extracted</Text>
          <Text style={styles.kvVal}>
            {JSON.stringify(result.signal?.structured_data, null, 2)}
          </Text>
          <Pressable
            style={[styles.submit, { marginTop: 18 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.submitText}>Done</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontWeight: "600", marginBottom: 6 },
  textarea: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    padding: 10,
    minHeight: 110,
    textAlignVertical: "top",
  },
  locRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  locBtn: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  locBtnText: { color: colors.accent, fontWeight: "600" },
  locText: { color: colors.textMuted, fontFamily: "Menlo", fontSize: 12 },
  error: { color: colors.danger, marginTop: 10, fontSize: 13 },
  submit: {
    marginTop: 18,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  submitText: { color: "#0b1220", fontWeight: "700", fontSize: 15 },
  resultCard: {
    marginTop: 22,
    backgroundColor: colors.panel,
    borderColor: colors.ok,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  resultTitle: { color: colors.ok, fontWeight: "700", marginBottom: 6 },
  resultText: { color: colors.text, marginBottom: 10 },
  kvKey: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: "uppercase",
    marginTop: 8,
  },
  kvVal: { color: colors.text, fontFamily: "Menlo", fontSize: 12 },
});
