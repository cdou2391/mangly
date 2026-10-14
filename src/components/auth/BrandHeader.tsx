import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { auth } from "./authTheme";

const MARK = require("../../../assets/logo-mark.png");

export function BrandHeader({ compact = false }: { compact?: boolean }) {
  const { width } = useWindowDimensions();
  // The mark's artwork fills about 80% of its image, so these give a visible M about a third of the screen wide.
  const size = Math.min(width * (compact ? 0.32 : 0.48), compact ? 140 : 210);
  return (
    <View style={styles.wrap}>
      <Image
        source={MARK}
        style={{ width: size, height: size }}
        contentFit="contain"
        accessibilityLabel="MangaPulse logo"
      />
      <Text accessibilityRole="header" style={[styles.word, compact && styles.wordCompact]}>
        Manga<Text style={styles.pulse}>Pulse</Text>
      </Text>
      {compact ? null : <Text style={styles.tagline}>MANGA LIVES HERE</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  word: { color: auth.text, fontSize: 44, fontWeight: "800", letterSpacing: -1, marginTop: -6 },
  wordCompact: { fontSize: 34 },
  pulse: { color: auth.red },
  tagline: { color: auth.muted, fontSize: 12, letterSpacing: 7, marginTop: 6 },
});
