import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@/auth/AuthContext";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BrandHeader } from "@/components/auth/BrandHeader";
import { auth } from "@/components/auth/authTheme";

/**
 * Shown instead of the login screen when the app has a stored session but cannot reach the server (no signal, server down,
 * very slow). The user is still signed in; the app keeps trying and moves on as soon as it gets through.
 */
export default function Offline() {
  const { retry, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const tryAgain = async () => {
    setBusy(true);
    try {
      await retry();
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You'll need to log in again with your email and password.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <AuthScreen header={<BrandHeader compact />}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name="cloud-offline-outline" size={34} color={auth.red} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          Can't reach MangaPulse
        </Text>
        <Text style={styles.text}>You're still signed in. Check your connection and we'll pick up where you left off.</Text>
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          Trying again automatically…
        </Text>
      </View>
      <AuthButton title="Try again" icon="refresh" onPress={tryAgain} loading={busy} />
      <View style={{ height: 12 }} />
      <AuthButton variant="secondary" title="Sign out" icon="log-out-outline" onPress={confirmSignOut} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: "center", gap: 10, marginBottom: 26 },
  icon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,42,42,0.6)", backgroundColor: "rgba(255,42,42,0.1)", marginBottom: 6 },
  title: { color: auth.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  text: { color: auth.muted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  hint: { color: auth.muted, fontSize: 13, opacity: 0.75, marginTop: 4 },
});
