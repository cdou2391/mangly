import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import { Button, ErrorNote, Screen } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FilterChips } from "@/components/library/FilterChips";
import { LibraryRow } from "@/components/library/LibraryRow";
import { NewRail } from "@/components/library/NewRail";
import { HeroPicks } from "@/components/library/HeroPicks";
import { countByFilter, sortLibrary, type LibraryFilter } from "@/utils/library";
import { FILTERS } from "@/utils/library";
import { useOpenChapter } from "@/hooks/useOpenChapter";
import { useFollowPick, useHomePicks } from "@/hooks/useHomePicks";
import { useUpdatesFeed } from "@/hooks/useUpdatesFeed";
import { fromRecent } from "@/utils/feed";
import { palette } from "@/theme";

export default function Library() {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const openChapter = useOpenChapter();

  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const recent = useQuery({ queryKey: ["recent-chapters"], queryFn: trackingApi.recentChapters });
  const feed = useUpdatesFeed();

  const items = tracked.data;
  const picks = useHomePicks();
  const { states: followStates, follow } = useFollowPick();
  const sorted = useMemo(() => sortLibrary(items ?? []), [items]);
  const counts = useMemo(() => countByFilter(items ?? []), [items]);
  const shown = filter === "all" ? sorted : sorted.filter((i) => i.reading_status === filter);
  const fresh = useMemo(() => (recent.data ?? []).filter((c) => c.is_new).slice(0, 10), [recent.data]);
  const unreadCount = feed.unreadCount;
  // Only claim "all caught up" once both lists have loaded and there is something being followed; never while loading or after an error.
  const caughtUp = recent.isSuccess && fresh.length === 0 && (items?.length ?? 0) > 0;

  const refresh = useCallback(async () => {
    await Promise.all([tracked.refetch(), recent.refetch(), feed.refetch(), picks.refetch()]);
  }, [tracked, recent, feed, picks]);

  const subtitle =
    items === undefined ? null : (
      <>
        {counts.all} tracked
        {fresh.length > 0 ? (
          <>
            {" · "}
            <Text style={{ color: palette.primary, fontWeight: "700" }}>
              {fresh.length} new {fresh.length === 1 ? "chapter" : "chapters"}
            </Text>
          </>
        ) : null}
      </>
    );

  const bell = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Updates, ${unreadCount} new` : "Updates"}
      onPress={() => router.navigate("/updates")}
      style={styles.bell}
    >
      <Ionicons name="notifications-outline" size={21} color={palette.text} />
      {unreadCount > 0 ? <View style={styles.dot} /> : null}
    </Pressable>
  );

  const header = (
    <>
      <ScreenHeader title="Library" subtitle={subtitle} right={bell} />
      <HeroPicks picks={picks.data ?? []} states={followStates} onFollow={follow} />
      <NewRail chapters={fresh} caughtUp={caughtUp} onOpen={(c) => openChapter(fromRecent(c))} onSeeAll={() => router.navigate("/updates")} />
      {items && items.length > 0 ? <FilterChips value={filter} counts={counts} onChange={setFilter} /> : null}
    </>
  );

  if (tracked.isError && !items) {
    return (
      <Screen padded={false}>
        <ScreenHeader title="Library" right={bell} />
        <ErrorNote title="Couldn't load your library" message={tracked.error.message} onRetry={() => tracked.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        testID="library-list"
        // Android detaches off-screen views of a long list to save memory; with lists nested in the header that can leave blank
        // space or missing cards when the content above changes height (a new-chapter row appearing, for one).
        removeClippedSubviews={false}
        data={tracked.isLoading ? [] : shown}
        keyExtractor={(i) => String(i.id)}
        ListHeaderComponent={header}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={tracked.isRefetching} onRefresh={refresh} tintColor={palette.primary} colors={[palette.primary]} progressBackgroundColor={palette.card} />}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <LibraryRow item={item} onPress={() => router.push({ pathname: "/manga/[id]", params: { id: String(item.id) } })} />
          </View>
        )}
        ListEmptyComponent={
          tracked.isLoading ? (
            <Skeleton />
          ) : (items?.length ?? 0) === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="library-outline" size={44} color={palette.faint} />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyHint}>Search for a title and tap Track to start following it.</Text>
              <View style={{ alignSelf: "stretch", marginTop: 8 }}>
                <Button title="Find a manga" onPress={() => router.navigate("/search")} />
              </View>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No titles here</Text>
              <Text style={styles.emptyHint}>
                Nothing is marked "{FILTERS.find((f) => f.key === filter)?.label}" right now.
              </Text>
            </View>
          )
        }
      />
    </Screen>
  );
}

function Skeleton() {
  return (
    <View style={{ gap: 11 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.cell, styles.skeleton]} accessibilityElementsHidden />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { paddingHorizontal: 20, paddingBottom: 11 },
  bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 8, right: 9, width: 13, height: 13, borderRadius: 7, backgroundColor: palette.primary, borderWidth: 2, borderColor: palette.card },
  empty: { alignItems: "center", gap: 10, paddingHorizontal: 32, paddingTop: 56 },
  emptyTitle: { color: palette.text, fontSize: 18, fontWeight: "800" },
  emptyHint: { color: palette.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  skeleton: { height: 98, marginHorizontal: 20, borderRadius: 16, backgroundColor: palette.card, opacity: 0.7 },
});
