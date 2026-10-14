import { Tabs } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { notificationsApi } from "@/api/endpoints";
import { useTheme } from "@/theme";

export default function TabsLayout() {
  const t = useTheme();
  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 120_000,
  });
  const count = unread.data?.count ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Library" }} />
      <Tabs.Screen name="updates" options={{ title: "Updates" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: "Alerts", tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined }}
      />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
