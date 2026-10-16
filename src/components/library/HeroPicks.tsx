import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { HomePick } from "@/api/types";
import { Cover } from "@/components/Cover";
import type { FollowState } from "@/hooks/useHomePicks";
import { palette } from "@/theme";

const SIDE = 20;
const GAP = 12;
/** How much of the next card shows beside the current one: it says "there is more", and shortens the swipe to it. */
const PEEK = 32;
const HEIGHT = 236;

/** The label on a card. */
export const pickLabel = (p: HomePick) => (p.kind === "similar" ? "SIMILAR" : "POPULAR");

/** The line under the title: why a similar pick was chosen, or how many readers follow a popular one. */
export function pickSubtitle(p: HomePick): string | null {
  if (p.kind === "similar") return p.because ? `Because you read ${p.because}` : null;
  if (p.readers !== null && p.readers > 1) return `${p.readers} readers follow this`;
  return p.genres[0] ?? p.author ?? null;
}

/**
 * The top of the Library: big swipeable cards recommending titles, each labelled SIMILAR (like something in the library)
 * or POPULAR (followed by other readers), with a Track button. Renders nothing without picks.
 */
export function HeroPicks({
  picks,
  states,
  onFollow,
}: {
  picks: HomePick[];
  states: Record<number, FollowState>;
  onFollow: (pick: HomePick) => void;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  if (picks.length === 0) return null;

  const cardWidth = width - SIDE - GAP - PEEK;
  const step = cardWidth + GAP;
  // Follows the scroll itself (not only where a swipe comes to rest), so the dots are right however the card was reached.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.max(0, Math.min(picks.length - 1, Math.round(e.nativeEvent.contentOffset.x / step))));

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={picks}
        keyExtractor={(p) => String(p.id)}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        // Any swipe moves to the next card, however short or slow: a card is almost as wide as the screen, so an
        // ordinary swipe is well short of halfway, which would otherwise snap straight back.
        disableIntervalMomentum
        // This list is inside the Library's vertical list; without this, Android can hand the gesture to the parent.
        nestedScrollEnabled
        onScroll={onScroll}
        scrollEventThrottle={32}
        testID="hero-list"
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
        renderItem={({ item }) => {
          const state = states[item.id];
          const sub = pickSubtitle(item);
          return (
            <View
              style={[styles.card, { width: cardWidth }]}
              accessible
              accessibilityLabel={[item.title, pickLabel(item).toLowerCase(), sub].filter(Boolean).join(". ")}
            >
              <Cover uri={item.cover_url} style={StyleSheet.absoluteFill} />
              <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.92)"]} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
              <View style={[styles.tag, item.kind === "similar" && styles.tagSimilar]}>
                <Text style={styles.tagText}>{pickLabel(item)}</Text>
              </View>
              <View style={styles.meta}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={styles.title}>
                    {item.title}
                  </Text>
                  {sub ? (
                    <Text numberOfLines={1} style={styles.sub}>
                      {sub}
                    </Text>
                  ) : null}
                  {item.genres.length > 0 ? (
                    <Text numberOfLines={1} style={styles.genres}>
                      {item.genres.slice(0, 3).join(" · ")}
                    </Text>
                  ) : null}
                </View>
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
      {picks.length > 1 ? (
        <View testID="hero-dots" style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {picks.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === Math.min(index, picks.length - 1) && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 22 },
  card: { height: HEIGHT, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: palette.raised },
  tag: { position: "absolute", top: 12, left: 12, backgroundColor: palette.primary, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  tagSimilar: { backgroundColor: "rgba(0,0,0,0.62)", borderWidth: 1, borderColor: palette.primary },
  tagText: { color: "#fff", fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },
  meta: { position: "absolute", left: 14, right: 14, bottom: 14, flexDirection: "row", alignItems: "flex-end", gap: 12 },
  title: { color: "#fff", fontSize: 21, fontWeight: "800", lineHeight: 24, letterSpacing: -0.4 },
  sub: { color: "#E6E6E8", fontSize: 13, fontWeight: "600", marginTop: 4 },
  genres: { color: "#A8A8AE", fontSize: 12, marginTop: 2 },
  track: { minWidth: 86, height: 38, paddingHorizontal: 16, borderRadius: 12, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  trackFailed: { backgroundColor: palette.primaryDeep },
  trackText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  dotOn: { width: 18, backgroundColor: palette.primary },
});
