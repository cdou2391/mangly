import { StyleSheet, View, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUpdatesFeed } from "@/hooks/useUpdatesFeed";
import { palette } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
const ICONS: Record<string, [IconName, IconName]> = {
  library: ["library", "library-outline"],
  updates: ["flash", "flash-outline"],
  search: ["search", "search-outline"],
  settings: ["person", "person-outline"],
};

const icon =
  (route: keyof typeof ICONS) =>
  ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <View style={styles.iconBox}>
      {focused ? <View style={styles.indicator} /> : null}
      <Ionicons name={ICONS[route][focused ? 0 : 1]} size={24} color={color} />
    </View>
  );

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Updates carries what used to be the Alerts badge: the number of chapters you have not read yet.
  const count = useUpdatesFeed().unreadCount;

  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#FFFFFF",
          tabBarInactiveTintColor: "#76767C",
          // Explicit height: icon + label need room, and the system navigation bar inset has to be added by hand.
          tabBarStyle: { backgroundColor: palette.bg, borderTopColor: "rgba(255,255,255,0.09)", borderTopWidth: StyleSheet.hairlineWidth, height: 64 + insets.bottom, paddingBottom: insets.bottom + 6, paddingTop: 8 },
          tabBarItemStyle: { paddingTop: 0 },
          tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600", letterSpacing: 0.2 },
          tabBarBadgeStyle: { backgroundColor: palette.primary, color: "#fff", fontSize: 10, fontWeight: "800", borderWidth: 2, borderColor: palette.bg },
        }}
      >
        <Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: icon("library") }} />
        <Tabs.Screen
          name="updates"
          options={{
            title: "Updates",
            tabBarIcon: icon("updates"),
            tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined,
          }}
        />
        <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: icon("search") }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("settings") }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconBox: { alignItems: "center", justifyContent: "center" },
  // A red bar at the top edge of the active tab, with a glow where the platform supports one.
  indicator: { position: "absolute", top: -11, width: 30, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.primary, shadowColor: palette.primary, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
});
