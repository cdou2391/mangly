import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { PopularManga } from "@/api/types";
import { Cover } from "@/components/Cover";
import type { FollowState } from "@/hooks/usePopular";
import { palette } from "@/theme";

/** What to say under a title: how many readers follow it when that is more than one, else what it is. */
export function popularSubtitle(p: PopularManga): string | null {
  if (p.readers > 1) return `${p.readers} readers`;
  return p.genres[0] ?? p.author ?? null;
}

/**
 * "POPULAR ON MANGAPULSE": titles other readers follow, for someone with an empty or nearly empty library. Each card has
 * a Track button. Renders nothing without titles.
 */
export function PopularRail({
  titles,
  states,
  onFollow,
}: {
  titles: PopularManga[];
  states: Record<number, FollowState>;
  onFollow: (title: PopularManga) => void;
}) {
  if (titles.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>POPULAR ON MANGAPULSE</Text>
      </View>
      <Text style={styles.caption}>Titles other readers follow. Tap Track to add one to your library.</Text>
      <FlatList
        horizontal
        data={titles}
        keyExtractor={(t) => String(t.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        renderItem={({ item }) => {
          const state = states[item.id];
          const sub = popularSubtitle(item);
          return (
            <View style={styles.card}>
              <Cover uri={item.cover_url} style={StyleSheet.absoluteFill} />
              <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.94)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
              <View style={styles.meta}>
                <Text numberOfLines={2} style={styles.title}>
                  {item.title}
                </Text>
                {sub ? (
                  <Text numberOfLines={1} style={styles.sub}>
                    {sub}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Track ${item.title}`}
                  accessibilityState={{ busy: state === "adding", disabled: state === "adding" }}
                  disabled={state === "adding"}
                  onPress={() => onFollow(item)}
                  style={({ pressed }) => [styles.track, state === "failed" && styles.trackFailed, (pressed || state === "adding") && { opacity: 0.75 }]}
                >
                  {state === "adding" ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.trackText}>{state === "failed" ? "Try again" : "Track"}</Text>}
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28, marginBottom: 8 },
  head: { paddingHorizontal: 20 },
  label: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4 },
  caption: { color: palette.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: 20, marginTop: 6, marginBottom: 12 },
  card: { width: 148, height: 250, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: palette.raised },
  meta: { position: "absolute", left: 11, right: 11, bottom: 11 },
  title: { color: "#fff", fontSize: 14, fontWeight: "800", lineHeight: 16, letterSpacing: -0.2 },
  sub: { color: "#D7D7DA", fontSize: 12, fontWeight: "600", marginTop: 3 },
  track: { marginTop: 10, height: 34, borderRadius: 10, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  trackFailed: { backgroundColor: palette.primaryDeep },
  trackText: { color: "#fff", fontSize: 13.5, fontWeight: "800" },
});
