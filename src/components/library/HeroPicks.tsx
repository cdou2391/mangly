import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { HomePick } from "@/api/types";
import { Cover } from "@/components/Cover";
import type { FollowState } from "@/hooks/useHomePicks";
import { palette } from "@/theme";

const HEIGHT = 300;

/** The label on a card. */
export const pickLabel = (p: HomePick) => (p.kind === "similar" ? "SIMILAR" : "POPULAR");

/** The line under the title: why a similar pick was chosen, or how many readers follow a popular one. */
export function pickSubtitle(p: HomePick): string | null {
  if (p.kind === "similar") return p.because ? `Because you read ${p.because}` : null;
  if (p.readers !== null && p.readers > 1) return `${p.readers} readers follow this`;
  return p.genres[0] ?? p.author ?? null;
}

/**
 * The top of the Library: a full-width banner of recommended titles, one page per title, swiped sideways. Each page is the
 * cover edge to edge with the title inside it, a label (SIMILAR: like something in the library; POPULAR: followed by other
 * readers) and a Track button. Renders nothing without picks.
 *
 * Deliberately a plain paging ScrollView (no snapping arithmetic, no virtualized list): there are at most a dozen pages, and
 * paging by exactly one screen width is what Android does most reliably. It is not virtualized, so Android cannot detach its
 * pages when the content around it changes height, which is how a virtualized list inside another one can lose its cards.
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

  // Follows the scroll itself (not only where a swipe comes to rest), so the dots are right however the page was reached.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.max(0, Math.min(picks.length - 1, Math.round(e.nativeEvent.contentOffset.x / width))));

  return (
    <View style={styles.wrap}>
      <ScrollView
        testID="hero-list"
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        // The banner is inside the Library's vertical list; without this, Android can hand the gesture to the parent.
        nestedScrollEnabled
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {picks.map((item) => {
          const state = states[item.id];
          const sub = pickSubtitle(item);
          return (
            <View
              key={item.id}
              style={[styles.page, { width }]}
              accessible
              accessibilityLabel={[item.title, pickLabel(item).toLowerCase(), sub].filter(Boolean).join(". ")}
            >
              <Cover uri={item.cover_url} style={StyleSheet.absoluteFill} />
              <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.92)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
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
        })}
      </ScrollView>
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
  page: { height: HEIGHT, backgroundColor: palette.raised },
  tag: { position: "absolute", top: 16, left: 20, backgroundColor: palette.primary, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  tagSimilar: { backgroundColor: "rgba(0,0,0,0.62)", borderWidth: 1, borderColor: palette.primary },
  tagText: { color: "#fff", fontSize: 10.5, fontWeight: "800", letterSpacing: 1 },
  meta: { position: "absolute", left: 20, right: 20, bottom: 20, flexDirection: "row", alignItems: "flex-end", gap: 14 },
  title: { color: "#fff", fontSize: 26, fontWeight: "800", lineHeight: 29, letterSpacing: -0.5 },
  sub: { color: "#E6E6E8", fontSize: 14, fontWeight: "600", marginTop: 5 },
  genres: { color: "#A8A8AE", fontSize: 12.5, marginTop: 2 },
  track: { minWidth: 92, height: 40, paddingHorizontal: 18, borderRadius: 12, backgroundColor: palette.primary, alignItems: "center", justifyContent: "center" },
  trackFailed: { backgroundColor: palette.primaryDeep },
  trackText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  dotOn: { width: 18, backgroundColor: palette.primary },
});
