import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { RecentChapter } from "@/api/types";
import { Cover } from "@/components/Cover";
import { shortChapter } from "@/utils/chapters";
import { palette } from "@/theme";

/** "NEW FOR YOU": large cards for chapters that just dropped. Renders nothing when there are none. */
export function NewRail({
  chapters,
  onOpen,
  onSeeAll,
}: {
  chapters: RecentChapter[];
  onOpen: (c: RecentChapter) => void;
  onSeeAll: () => void;
}) {
  if (chapters.length === 0) return null;
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={styles.head}>
        <Text style={styles.label}>NEW FOR YOU</Text>
        <Pressable accessibilityRole="link" hitSlop={10} onPress={onSeeAll}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={chapters}
        keyExtractor={(c) => `${c.tracking_id}-${c.chapter}-${c.source}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.manga_title}, ${shortChapter(item.chapter) ?? item.chapter}, new`}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
          >
            <Cover uri={item.manga_cover_url} style={StyleSheet.absoluteFill} />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.92)"]}
              locations={[0.38, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.tag}>
              <Text style={styles.tagText}>NEW</Text>
            </View>
            <View style={styles.meta}>
              <Text numberOfLines={2} style={styles.title}>
                {item.manga_title}
              </Text>
              <Text numberOfLines={1} style={styles.chapter}>
                {shortChapter(item.chapter)?.replace(/^Ch\./, "Chapter") ?? item.chapter}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  label: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4 },
  seeAll: { color: "#A0A0A6", fontSize: 13, fontWeight: "600" },
  card: { width: 138, height: 222, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: palette.raised },
  tag: { position: "absolute", top: 9, left: 9, backgroundColor: palette.primary, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  meta: { position: "absolute", left: 11, right: 11, bottom: 11 },
  title: { color: "#fff", fontSize: 14, fontWeight: "800", lineHeight: 16, letterSpacing: -0.2 },
  chapter: { color: "#D7D7DA", fontSize: 12, fontWeight: "600", marginTop: 3 },
});
