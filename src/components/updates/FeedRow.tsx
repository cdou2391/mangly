import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Cover } from "@/components/Cover";
import { shortChapter } from "@/utils/chapters";
import { formatWhen, type FeedItem } from "@/utils/feed";
import { palette } from "@/theme";

const SOURCES: Record<string, string> = { mangaread: "MangaRead", weebcentral: "WeebCentral" };
const sourceName = (s: string) => SOURCES[s.toLowerCase()] ?? s;

/** One release: red-edged with a NEW tag while unread, dimmed once read. */
export function FeedRow({ item, now, onPress }: { item: FeedItem; now: Date; onPress: () => void }) {
  const chapter = shortChapter(item.chapter) ?? item.chapter;
  const when = formatWhen(item.at, now);
  const detail = `${chapter} · ${sourceName(item.source)}`;
  const spoken = [item.title, chapter, sourceName(item.source), item.unread ? "new" : "read", when].filter(Boolean).join(". ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={item.chapter_url ? "Opens the chapter" : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.row, item.unread ? styles.rowNew : styles.rowRead, pressed && { opacity: 0.85 }]}
    >
      <Cover uri={item.cover_url} style={styles.cover} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.detail}>
          {detail}
        </Text>
        <View style={styles.meta}>
          {item.unread ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>NEW</Text>
            </View>
          ) : (
            <Text style={styles.when}>Read</Text>
          )}
          {when ? <Text style={styles.when}>{item.unread ? when : `·  ${when}`}</Text> : null}
        </View>
      </View>
      <Ionicons name={item.chapter_url ? (item.unread ? "open-outline" : "book-outline") : "chevron-forward"} size={20} color={palette.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 13, padding: 10, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1 },
  rowNew: { borderColor: "rgba(255,42,42,0.35)" },
  rowRead: { borderColor: "rgba(255,255,255,0.07)", opacity: 0.66 },
  cover: { width: 54, height: 76, borderRadius: 9 },
  body: { flex: 1, minWidth: 0 },
  title: { color: palette.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  detail: { color: "#B8B8BD", fontSize: 12.5, marginTop: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  tag: { backgroundColor: palette.primary, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  when: { color: palette.muted, fontSize: 12.5 },
});
