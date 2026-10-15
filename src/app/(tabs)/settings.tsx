import { useMemo, useState } from "react";
import { Alert, ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import { useAlertSetting } from "@/alerts";
import { trackingApi } from "@/api/endpoints";
import { useOnline } from "@/api/reachability";
import { useAuth } from "@/auth/AuthContext";
import { WEB_URL } from "@/config";
import { Screen } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { LibraryStats } from "@/components/settings/LibraryStats";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { SettingsGroup, SettingsRow, SettingsSwitchRow } from "@/components/settings/SettingsRow";
import { countByFilter } from "@/utils/library";
import { palette } from "@/theme";

const VERSION = Constants.expoConfig?.version ?? "dev";

export default function Settings() {
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const online = useOnline();
  const alerts = useAlertSetting();
  // The library list is already kept fresh by every screen that changes it, so the numbers are counted from it
  // rather than from a separate stats request that would go stale.
  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const counts = useMemo(() => (tracked.data ? countByFilter(tracked.data) : null), [tracked.data]);
  if (state.status !== "signedIn") return null;
  const { user } = state;

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will stop receiving push notifications on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          setSigningOut(true);
          void signOut().finally(() => setSigningOut(false));
        },
      },
    ]);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={tracked.isRefetching} onRefresh={() => tracked.refetch()} tintColor={palette.primary} colors={[palette.primary]} progressBackgroundColor={palette.card} />}
      >
        <ScreenHeader title="Settings" />
        <View style={styles.body}>
          <ProfileCard name={user.full_name} email={user.email} isAdmin={user.role === "admin"} createdAt={user.created_at} />

          <View>
            <Text style={styles.section}>YOUR LIBRARY</Text>
            {tracked.isError && !counts ? (
              <Pressable accessibilityRole="button" onPress={() => tracked.refetch()} style={styles.failed}>
                <Ionicons name="refresh" size={18} color={palette.primary} />
                <Text style={styles.failedText}>Couldn't load your library numbers. Tap to retry.</Text>
              </Pressable>
            ) : (
              <LibraryStats counts={counts} />
            )}
          </View>

          <SettingsGroup title="NOTIFICATIONS">
            <SettingsSwitchRow
              icon="notifications-outline"
              label="New chapter notifications"
              hint="Checked in the background, so they can arrive a while after a chapter is out."
              value={alerts.on}
              busy={alerts.busy}
              onChange={(v) => void alerts.set(v)}
              last
            />
          </SettingsGroup>

          <SettingsGroup title="HELP & ABOUT">
            <SettingsRow icon={online ? "cloud-done-outline" : "cloud-offline-outline"} label="Connection" value={online ? "Online" : "Offline"} warn={!online} />
            <SettingsRow icon="globe-outline" label="MangaPulse on the web" onPress={() => WebBrowser.openBrowserAsync(WEB_URL)} />
            <SettingsRow icon="key-outline" label="Reset password" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/forgot-password`)} />
            <SettingsRow icon="information-circle-outline" label="Version" value={VERSION} last />
          </SettingsGroup>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            accessibilityState={{ busy: signingOut, disabled: signingOut }}
            disabled={signingOut}
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.signOut, (pressed || signingOut) && { opacity: 0.7 }]}
          >
            {signingOut ? <ActivityIndicator size="small" color={palette.danger} /> : <Ionicons name="log-out-outline" size={19} color={palette.danger} />}
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  body: { paddingHorizontal: 20, gap: 26 },
  section: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4, marginBottom: 10 },
  failed: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,42,42,0.35)" },
  failedText: { flex: 1, color: "#D7D7DA", fontSize: 14, lineHeight: 19 },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,90,90,0.4)", backgroundColor: "rgba(255,90,90,0.07)" },
  signOutText: { color: palette.danger, fontSize: 15.5, fontWeight: "700" },
});
