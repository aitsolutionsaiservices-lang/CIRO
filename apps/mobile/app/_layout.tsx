import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="report"
          options={{
            presentation: "modal",
            headerShown: true,
            headerStyle: { backgroundColor: "#0f172a" },
            headerTitleStyle: { color: "#f8fafc" },
            headerTintColor: "#22d3ee",
            title: "Report an Issue",
          }}
        />
        <Stack.Screen
          name="incident/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#0f172a" },
            headerTitleStyle: { color: "#f8fafc" },
            headerTintColor: "#22d3ee",
            title: "Incident",
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
