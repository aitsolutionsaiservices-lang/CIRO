import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#22d3ee",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: { backgroundColor: "#0f172a", borderTopColor: "#1e293b" },
        headerStyle: { backgroundColor: "#0f172a" },
        headerTitleStyle: { color: "#f8fafc" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Citizen",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="responder"
        options={{
          title: "Responder",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
