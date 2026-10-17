import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import { BackBar } from "@/components/detail/BackBar";
import { BarRow, Section, StatTile } from "@/components/stats/StatParts";
import { ErrorNote, Loading, Screen } from "@/components/ui";
import { computeStats, type LibraryStats } from "@/utils/stats";
import { sourceName } from "@/utils/sources";
import { palette } from "@/theme";

const STATUS: Record<string, { label: string; color: string }> = {
  reading: { label: "Reading", color: palette.primary },
  completed: { label: "Completed", color: palette.success },
  on_hold: { label: "On hold", color: "#E0A93A" },
  plan_to_read: { label: "Plan to read", color: "#8E8E93" },
  dropped: { label: "Dropped", color: "#5C5C62" },
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The library in numbers, worked out on the phone from the list that is already loaded (so it also works offline). */
export default function Stats() {
  const q = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const stats = useMemo(() => (q.data ? computeStats(q.data, new Date(), sourceName) : null), [q.data]);

  if (q.isLoading) {
    return (
      <Screen padded={false}>
        <BackBar />
        <Loading />
      </Screen>
    );
  }
  if (!stats) {
    return (
      <Screen padded={false}>
        <BackBar />
        <ErrorNote title="Couldn't load your stats" message={q.error?.message ?? "Something went wrong."} onRetry={() => q.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <BackBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.title}>
          Your stats
        </Text>
        {stats.titles === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="stats-chart-outline" size={44} color={palette.faint} />
            <Text style={styles.emptyTitle}>Nothing to count yet</Text>
            <Text style={styles.emptyHint}>Add a few titles from Search and your numbers show up here.</Text>
          </View>
        ) : (
          <Body stats={stats} />
        )}
      </ScrollView>
    </Screen>
  );
}

function Body({ stats }: { stats: LibraryStats }) {
  const top = (list: { count: number }[]) => Math.max(1, ...list.map((l) => l.count));
  const ratingRows = ([5, 4, 3, 2, 1] as const).map((n) => ({ n, count: stats.ratings[n] }));
  const ratingTop = Math.max(1, ...ratingRows.map((r) => r.count));

  return (
    <>
      <View style={styles.tiles}>
        <StatTile value={stats.titles.toLocaleString("en-US")} label="Titles" note={stats.addedLast30Days > 0 ? `${stats.addedLast30Days} added in the last 30 days` : undefined} />
        <StatTile value={stats.chaptersRead.toLocaleString("en-US")} label="Chapters read" note="Counted from your last chapter in each title" />
        <StatTile value={stats.chaptersBehind.toLocaleString("en-US")} label="Chapters to catch up" note={stats.titlesBehind > 0 ? `Across ${plural(stats.titlesBehind, "title", "titles")}` : "You're all caught up"} />
        <StatTile value={stats.averageRating === null ? "–" : stats.averageRating.toFixed(1)} label="Average rating" note={stats.rated > 0 ? `${plural(stats.rated, "title", "titles")} rated, out of 5` : "Nothing rated yet"} />
      </View>

      <Section title="STATUS">
        <View accessible accessibilityLabel={stats.byStatus.map((s) => `${STATUS[s.status].label} ${s.count}`).join(", ")} style={styles.stack}>
          {stats.byStatus.map((s) => (
            <View key={s.status} style={{ flex: s.count, backgroundColor: STATUS[s.status].color }} />
          ))}
        </View>
        <View style={styles.legend}>
          {stats.byStatus.map((s) => (
            <View key={s.status} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: STATUS[s.status].color }]} />
              <Text style={styles.legendText}>
                {STATUS[s.status].label} · {s.count}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="YOUR RATINGS">
        {stats.rated === 0 ? (
          <Text style={styles.hint}>Rate the titles you've read to see how you score them.</Text>
        ) : (
          ratingRows.map((r) => <BarRow key={r.n} label={`${r.n} ${r.n === 1 ? "star" : "stars"}`} count={r.count} fraction={r.count / ratingTop} />)
        )}
      </Section>

      {stats.genres.length > 0 ? (
        <Section title="TOP GENRES">
          {stats.genres.map((g) => (
            <BarRow key={g.label} label={g.label} count={g.count} fraction={g.count / top(stats.genres)} />
          ))}
        </Section>
      ) : null}

      <Section title="BY SITE">
        {stats.sources.map((s) => (
          <BarRow key={s.label} label={s.label} count={s.count} fraction={s.count / top(stats.sources)} color={palette.primaryDeep} />
        ))}
      </Section>

      {stats.furthestBehind.length > 0 ? (
        <Section title="FURTHEST BEHIND">
          {stats.furthestBehind.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={`${t.title}, ${plural(t.behind, "chapter", "chapters")} behind`}
              onPress={() => router.push({ pathname: "/manga/[id]", params: { id: String(t.id) } })}
              style={({ pressed }) => [styles.behind, pressed && { opacity: 0.8 }]}
            >
              <Text numberOfLines={1} style={styles.behindTitle}>
                {t.title}
              </Text>
              <Text style={styles.behindCount}>+{t.behind}</Text>
              <Ionicons name="chevron-forward" size={16} color={palette.faint} />
            </Pressable>
          ))}
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 22 },
  title: { color: palette.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  stack: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: "#D7D7DA", fontSize: 13, fontWeight: "600" },
  hint: { color: palette.muted, lineHeight: 20 },
  behind: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  behindTitle: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "600" },
  behindCount: { color: palette.primary, fontSize: 14.5, fontWeight: "800" },
  empty: { alignItems: "center", gap: 10, paddingTop: 70 },
  emptyTitle: { color: palette.text, fontSize: 18, fontWeight: "800" },
  emptyHint: { color: palette.muted, textAlign: "center", lineHeight: 20 },
});
