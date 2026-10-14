import { Alert, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { Button, Screen } from "@/components/ui";
import { spacing, useTheme } from "@/theme";

export default function Settings() {
  const t = useTheme();
  const { state, signOut } = useAuth();
  const stats = useQuery({ queryKey: ["tracking-stats"], queryFn: trackingApi.stats });
  if (state.status !== "signedIn") return null;

  return (
    <Screen>
      <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", marginBottom: spacing.lg }}>Settings</Text>
      <View style={{ gap: 2, marginBottom: spacing.xl }}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: "600" }}>{state.user.full_name}</Text>
        <Text style={{ color: t.muted }}>{state.user.email}</Text>
        {stats.data ? (
          <Text style={{ color: t.muted, marginTop: spacing.sm }}>
            {stats.data.total} tracked · {stats.data.reading} reading · {stats.data.completed} completed
          </Text>
        ) : null}
      </View>
      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert("Sign out?", "You will stop receiving push notifications on this device.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </Screen>
  );
}
