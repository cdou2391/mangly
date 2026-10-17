import { useCallback, useMemo, useState } from "react";
import { Alert, ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { sendTestNotification, useAlertSetting, useAlertStatus } from "@/alerts";
import { formatDelay, lastCheckLine, typicalDelay } from "@/alerts/status";
import { trackingApi } from "@/api/endpoints";
import { useOnline } from "@/api/reachability";
import { useAuth } from "@/auth/AuthContext";
import { WEB_URL } from "@/config";
import { shareLibrary } from "@/export/shareLibrary";
import { Screen } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { LibraryStats } from "@/components/settings/LibraryStats";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { SettingsGroup, SettingsRow, SettingsSwitchRow } from "@/components/settings/SettingsRow";
import { EXPORT_TYPES, type ExportFormat } from "@/utils/exportLibrary";
import { openInBrowser } from "@/utils/browser";
import { countByFilter } from "@/utils/library";
import { palette } from "@/theme";

const VERSION = Constants.expoConfig?.version ?? "dev";

export default function Settings() {
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const online = useOnline();
  const alerts = useAlertSetting();
  const alertStatus = useAlertStatus();
  const [testing, setTesting] = useState(false);
  const { refresh: refreshAlertStatus } = alertStatus;
  // The background check writes its status while the app is closed, and this tab stays mounted: read it when it is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshAlertStatus();
    }, [refreshAlertStatus]),
  );
  // The library list is already kept fresh by every screen that changes it, so the numbers are counted from it
  // rather than from a separate stats request that would go stale.
  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const counts = useMemo(() => (tracked.data ? countByFilter(tracked.data) : null), [tracked.data]);
  if (state.status !== "signedIn") return null;
  const checkLine = alertStatus.state ? lastCheckLine(alertStatus.state, Date.now()) : { value: "", warn: false };
  const delay = alertStatus.state ? typicalDelay(alertStatus.state.delays) : null;
  const { user } = state;

  const exportLibrary = async (format: ExportFormat) => {
    if (!tracked.data || exporting) return;
    if (tracked.data.length === 0) {
      Alert.alert("Nothing to export", "Your library is empty. Add a title first.");
      return;
    }
    setExporting(format);
    try {
      await shareLibrary(format, tracked.data);
    } catch (e) {
      Alert.alert("Couldn't export your library", e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setExporting(null);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      if ((await sendTestNotification()) === "no-permission") {
        Alert.alert("Notifications are blocked", "Allow notifications for MangaPulse in your phone's settings, then try again.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open settings", onPress: () => void Linking.openSettings().catch(() => {}) },
        ]);
      }
    } catch {
      Alert.alert("Couldn't send the test", "Something went wrong. Try again.");
    } finally {
      setTesting(false);
    }
  };

  const explainDelays = (samples: number | null) =>
    Alert.alert(
      "Alerts arriving late?",
      "MangaPulse looks for new chapters about once an hour, and your phone asks for them at best every 15 minutes. Android runs those checks later when the phone is idle, in battery saver, or when it limits background apps.\n\n" +
        "To help: open the app's settings, then Battery, and choose Unrestricted (or Not optimized). Avoid force-stopping the app.\n\n" +
        (samples === null
          ? "Alert delay is how long after MangaPulse finds a chapter your phone shows it. It appears once a few alerts have arrived."
          : `Alert delay is how long after MangaPulse finds a chapter your phone shows it (the middle of your last ${samples}).`),
      [
        { text: "Close", style: "cancel" },
        { text: "Open app settings", onPress: () => void Linking.openSettings().catch(() => {}) },
      ],
    );

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
            {counts ? (
              <View style={styles.link}>
                <SettingsRow icon="stats-chart-outline" label="All your stats" onPress={() => router.push("/stats")} last navigates />
              </View>
            ) : null}
          </View>

          <SettingsGroup title="ACCOUNT">
            <SettingsRow icon="lock-closed-outline" label="Change password" onPress={() => router.push("/change-password")} last navigates />
          </SettingsGroup>

          <SettingsGroup title="NOTIFICATIONS">
            <SettingsSwitchRow
              icon="notifications-outline"
              label="New chapter notifications"
              hint="Checked in the background, so they can arrive a while after a chapter is out."
              value={alerts.on}
              busy={alerts.busy}
              onChange={(v) => void alerts.set(v)}
              last={!alerts.on}
            />
            {alerts.on && alertStatus.state ? (
              <>
                <SettingsRow icon="time-outline" label="Last check" value={checkLine.value} warn={checkLine.warn} />
                <SettingsRow icon="speedometer-outline" label="Alert delay" value={delay ? formatDelay(delay.minutes) : "Not enough alerts yet"} />
                <SettingsRow icon="paper-plane-outline" label="Send a test notification" action trailing="notifications-outline" busy={testing} onPress={() => void sendTest()} />
                <SettingsRow icon="help-circle-outline" label="Alerts arriving late?" navigates onPress={() => explainDelays(delay?.samples ?? null)} last />
              </>
            ) : null}
          </SettingsGroup>

          <SettingsGroup title="YOUR DATA">
            {(Object.keys(EXPORT_TYPES) as ExportFormat[]).map((format, i, all) => (
              <SettingsRow
                key={format}
                icon={format === "csv" ? "grid-outline" : "code-slash-outline"}
                label={`Export library as ${EXPORT_TYPES[format].label}`}
                action
                busy={exporting === format}
                onPress={tracked.data ? () => void exportLibrary(format) : undefined}
                last={i === all.length - 1}
              />
            ))}
          </SettingsGroup>

          <SettingsGroup title="HELP & ABOUT">
            <SettingsRow icon={online ? "cloud-done-outline" : "cloud-offline-outline"} label="Connection" value={online ? "Online" : "Offline"} warn={!online} />
            <SettingsRow icon="globe-outline" label="MangaPulse on the web" onPress={() => openInBrowser(WEB_URL)} />
            <SettingsRow icon="key-outline" label="Reset password" onPress={() => openInBrowser(`${WEB_URL}/forgot-password`)} />
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
  link: { marginTop: 10, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  failed: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,42,42,0.35)" },
  failedText: { flex: 1, color: "#D7D7DA", fontSize: 14, lineHeight: 19 },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,90,90,0.4)", backgroundColor: "rgba(255,90,90,0.07)" },
  signOutText: { color: palette.danger, fontSize: 15.5, fontWeight: "700" },
});
