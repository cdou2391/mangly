import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { TrackedManga } from "@/api/types";
import { Cover } from "@/components/Cover";
import { PressScale } from "@/components/motion/PressScale";
import { readProgress, shortChapter } from "@/utils/chapters";
import { unreadOf } from "@/utils/library";
import { palette } from "@/theme";

export function LibraryRow({ item, onPress }: { item: TrackedManga; onPress: () => void }) {
  const read = shortChapter(item.last_chapter_read);
  const latest = shortChapter(item.manga.latest_chapter);
  const unread = unreadOf(item);
  const progress = readProgress(item.last_chapter_read, item.manga.latest_chapter);
  const behind = (unread ?? 0) > 0;

  const parts = [read ? `Read ${read}` : "Not started", latest ? `Latest ${latest}` : null].filter(Boolean) as string[];
  const summary = parts.join("  ·  "); // what is shown
  const spoken = parts.join(". "); // what a screen reader says: sentences, not visual spacing

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${item.manga.canonical_name}. ${spoken}.${behind ? ` ${unread} unread.` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Cover uri={item.manga.cover_url} style={styles.cover} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {item.manga.canonical_name}
        </Text>
        <Text numberOfLines={1} style={styles.summary}>
          {summary}
        </Text>
        {progress !== null ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
      {behind ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>+{unread! > 99 ? "99+" : unread}</Text>
        </View>
      ) : unread === 0 ? (
        <Ionicons name="checkmark-circle" size={22} color={palette.faint} />
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 13, padding: 10, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  cover: { width: 54, height: 76, borderRadius: 9 },
  body: { flex: 1, minWidth: 0 },
  title: { color: palette.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  summary: { color: palette.muted, fontSize: 12.5, marginTop: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: "#262626", marginTop: 10, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: palette.primary },
  pill: { backgroundColor: "rgba(255,42,42,0.16)", borderColor: "rgba(255,42,42,0.4)", borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { color: "#FF4A4A", fontSize: 12.5, fontWeight: "800" },
});
