import { StyleSheet, View } from "react-native";
import { palette } from "@/theme";

/** Placeholder cards while a search runs. It can take several seconds, since new titles are looked up on the source sites. */
export function ResultsSkeleton() {
  return (
    <View accessibilityLabel="Searching" accessibilityLiveRegion="polite" style={styles.wrap}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, { opacity: 1 - i * 0.2 }]}>
          <View style={styles.cover} />
          <View style={{ flex: 1, gap: 10 }}>
            <View style={[styles.line, { width: "62%", height: 15 }]} />
            <View style={[styles.line, { width: "40%" }]} />
            <View style={[styles.line, { width: "28%", height: 18 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 13, padding: 10, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  cover: { width: 60, height: 86, borderRadius: 9, backgroundColor: palette.raised },
  line: { height: 11, borderRadius: 6, backgroundColor: palette.raised },
});
