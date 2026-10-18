import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MoodPick } from "@/api/types";
import { palette } from "@/theme";

const MATCH = {
  high: { label: "Great match", color: palette.success },
  medium: { label: "Good match", color: "#E0A93A" },
  low: { label: "Mild match", color: palette.muted },
} as const;

/** One title an AI picked for a mood: why, how well it fits, and the way to follow it (or open it, when it is already followed). */
export function MoodPickCard({
  pick,
  trackingId,
  onOpen,
  onFind,
}: {
  pick: MoodPick;
  /** The title's place in the library when it is there, so it can be opened. */
  trackingId: number | null;
  onOpen: (trackingId: number) => void;
  onFind: (title: string) => void;
}) {
  const match = MATCH[pick.mood_match] ?? MATCH.low;
  const inLibrary = pick.from_your_library;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>
          {pick.title}
        </Text>
        <View style={[styles.badge, { borderColor: match.color }]}>
          <Text style={[styles.badgeText, { color: match.color }]}>{match.label}</Text>
        </View>
      </View>
      {pick.genres.length > 0 ? (
        <View style={styles.genres}>
          {pick.genres.slice(0, 4).map((g) => (
            <View key={g} style={styles.genre}>
              <Text style={styles.genreText}>{g}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.reason}>{pick.reason}</Text>

      {inLibrary && trackingId !== null ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${pick.title}, in your library`} onPress={() => onOpen(trackingId)} style={({ pressed }) => [styles.action, styles.open, pressed && { opacity: 0.8 }]}>
          <Ionicons name="checkmark-circle" size={18} color={palette.success} />
          <Text style={[styles.actionText, { color: palette.success }]}>In your library · Open</Text>
        </Pressable>
      ) : inLibrary ? (
        <View accessible accessibilityLabel="In your library" style={[styles.action, styles.open]}>
          <Ionicons name="checkmark-circle" size={18} color={palette.success} />
          <Text style={[styles.actionText, { color: palette.success }]}>In your library</Text>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Find ${pick.title} to track it`} onPress={() => onFind(pick.title)} style={({ pressed }) => [styles.action, styles.find, pressed && { opacity: 0.85 }]}>
          <Ionicons name="search" size={17} color="#fff" />
          <Text style={[styles.actionText, { color: "#fff" }]}>Find & track</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { flex: 1, color: palette.text, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  badgeText: { fontSize: 11.5, fontWeight: "800" },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  genre: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingHorizontal: 9, paddingVertical: 3 },
  genreText: { color: "#C8C8CC", fontSize: 12, fontWeight: "700" },
  reason: { color: "#D7D7DA", fontSize: 14.5, lineHeight: 21 },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, marginTop: 2 },
  find: { backgroundColor: palette.primary },
  open: { borderWidth: 1, borderColor: "rgba(61,220,151,0.4)", backgroundColor: "rgba(61,220,151,0.07)" },
  actionText: { fontSize: 14.5, fontWeight: "800" },
});
