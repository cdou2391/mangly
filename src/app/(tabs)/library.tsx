import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import type { TrackedManga } from "@/api/types";
import { Button, ErrorNote, Screen } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FilterChips } from "@/components/library/FilterChips";
import { LibraryRow } from "@/components/library/LibraryRow";
import { NewRail } from "@/components/library/NewRail";
import { HeroPicks } from "@/components/library/HeroPicks";
import { MoodEntry } from "@/components/mood/MoodEntry";
import { LibraryControls } from "@/components/library/LibraryControls";
import { Pager } from "@/components/library/Pager";
import { countByFilter, type LibraryFilter } from "@/utils/library";
import { applyView, hasUnread, isNarrowed, paginate, type LibraryView } from "@/utils/libraryView";
import { FILTERS } from "@/utils/library";
import { openInBrowser } from "@/utils/browser";
import { useOpenChapter } from "@/hooks/useOpenChapter";
import { useFollowPick, useHomePicks } from "@/hooks/useHomePicks";
import { useSortPreference } from "@/hooks/useSortPreference";
import { useUpdatesFeed } from "@/hooks/useUpdatesFeed";
import { useWarmBrowser } from "@/hooks/useWarmBrowser";
import { continueCards, type ContinueCard } from "@/utils/continueReading";
import { fromRecent } from "@/utils/feed";
import { palette } from "@/theme";

export default function Library() {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sort, setSort] = useSortPreference();
  const [pageNo, setPageNo] = useState(1);
  const listRef = useRef<FlatList<TrackedManga>>(null);
  const controlsY = useRef(0); // where the search field starts in the list, to scroll back to when the page changes
  const openChapter = useOpenChapter();
  useWarmBrowser();

  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const recent = useQuery({ queryKey: ["recent-chapters"], queryFn: trackingApi.recentChapters });
  const feed = useUpdatesFeed();

  const items = tracked.data;
  const picks = useHomePicks();
  const { states: followStates, follow } = useFollowPick();
  const resume = useMemo(() => continueCards(items ?? []), [items]);
  // Opens the page of the last chapter read (its "next" button goes on from there); progress changes only when the reader marks a chapter read.
  const resumeReading = useCallback(
    (card: ContinueCard) => {
      if (card.url) void openInBrowser(card.url);
      else router.push({ pathname: "/manga/[id]", params: { id: String(card.trackingId) } });
    },
    [],
  );
  const counts = useMemo(() => countByFilter(items ?? []), [items]);
  const behindCount = useMemo(() => (items ?? []).filter(hasUnread).length, [items]);
  // Search, filters and sorting run on the library already on the phone: instant, and the same offline. The list is shown a page at a time.
  const view = useMemo<LibraryView>(() => ({ query, status: filter, unreadOnly, sort }), [query, filter, unreadOnly, sort]);
  const visible = useMemo(() => applyView(items ?? [], view), [items, view]);
  const page = useMemo(() => paginate(visible, pageNo), [visible, pageNo]);

  // Any change to what is shown starts again from the first page.
  const changeView = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPageNo(1);
  };
  const goToPage = useCallback((next: number) => {
    setPageNo(next);
    listRef.current?.scrollToOffset({ offset: Math.max(0, controlsY.current - 8), animated: true });
  }, []);
  const clearView = () => {
    setQuery("");
    setFilter("all");
    setUnreadOnly(false);
    setPageNo(1);
  };
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
      <HeroPicks picks={picks.data ?? []} settled={!picks.isPending} states={followStates} onFollow={follow} onSearch={() => router.navigate("/search")} resume={resume} onResume={resumeReading} />
      <MoodEntry onOpen={() => router.push("/mood")} />
      <NewRail chapters={fresh} caughtUp={caughtUp} onOpen={(c) => openChapter(fromRecent(c))} onSeeAll={() => router.navigate("/updates")} />
      {items && items.length > 0 ? (
        <View onLayout={(e) => (controlsY.current = e.nativeEvent.layout.y)}>
          <LibraryControls query={query} onQuery={changeView(setQuery)} sort={sort} onSort={changeView(setSort)} />
          <FilterChips
            value={filter}
            counts={counts}
            onChange={changeView(setFilter)}
            unreadOnly={unreadOnly}
            unreadCount={behindCount}
            onToggleUnread={() => changeView(setUnreadOnly)(!unreadOnly)}
          />
        </View>
      ) : null}
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
        ref={listRef}
        testID="library-list"
        // Android detaches off-screen views of a long list to save memory; with lists nested in the header that can leave blank
        // space or missing cards when the content above changes height (a new-chapter row appearing, for one).
        removeClippedSubviews={false}
        data={tracked.isLoading ? [] : page.items}
        keyExtractor={(i) => String(i.id)}
        ListHeaderComponent={header}
        ListFooterComponent={<Pager page={page} onPage={goToPage} />}
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
              <Text style={styles.emptyTitle}>{query.trim() ? "No matches" : "No titles here"}</Text>
              <Text style={styles.emptyHint}>
                {query.trim()
                  ? `Nothing in your library matches "${query.trim()}"${filter !== "all" || unreadOnly ? " with these filters" : ""}.`
                  : filter !== "all"
                    ? `Nothing is marked "${FILTERS.find((f) => f.key === filter)?.label}"${unreadOnly ? " with unread chapters" : ""} right now.`
                    : "Nothing unread right now."}
              </Text>
              {isNarrowed(view) ? (
                <View style={{ alignSelf: "stretch", marginTop: 8 }}>
                  <Button title="Clear search and filters" onPress={clearView} />
                </View>
              ) : null}
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
