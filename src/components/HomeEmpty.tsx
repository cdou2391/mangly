import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Screen } from "@/components/ui";
import { spacing, useTheme } from "@/theme";

export function HomeEmpty() {
  const t = useTheme();
  return (
    <Screen>
      <View style={s.center}>
        <Image
          source={require("../../assets/logo.png")}
          style={s.logo}
          contentFit="contain"
          accessibilityLabel="MangaPulse logo"
        />
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 22, fontWeight: "700" }}>
          Your library is empty
        </Text>
        <Text style={{ color: t.muted, fontSize: 15, textAlign: "center", lineHeight: 22 }}>
          Manga you track will show up here, along with new chapter updates.
        </Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  logo: { width: 96, height: 96, marginBottom: spacing.sm },
});
