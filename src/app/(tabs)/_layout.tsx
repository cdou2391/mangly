import { StyleSheet, type ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon } from "@/components/TabIcon";
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
  ({ focused, color }: { focused: boolean; color: ColorValue }) => <TabIcon focused={focused} color={color} names={ICONS[route]} />;

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
          // Switching tabs slides the screens a little and fades them, instead of swapping them.
          animation: "shift",
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
