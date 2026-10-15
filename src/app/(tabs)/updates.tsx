import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ErrorNote, Loading, Screen } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { FeedFilter, type FeedFilterKey } from "@/components/updates/FeedFilter";
import { FeedRow } from "@/components/updates/FeedRow";
import { useMarkAllRead } from "@/hooks/useMarkChapterRead";
import { useOpenChapter } from "@/hooks/useOpenChapter";
import { useUpdatesFeed } from "@/hooks/useUpdatesFeed";
import { groupByDay } from "@/utils/feed";
import { palette } from "@/theme";

/** Everything that came out for the titles you track, newest first, with what is still unread marked NEW. */
export default function Updates() {
  const [filter, setFilter] = useState<FeedFilterKey>("all");
  const feed = useUpdatesFeed();
  const openChapter = useOpenChapter();
  const markAll = useMarkAllRead();

  const now = new Date();
  const shown = useMemo(() => (filter === "new" ? feed.items.filter((i) => i.unread) : feed.items), [filter, feed.items]);
  const sections = useMemo(() => groupByDay(shown, new Date()), [shown]);

  const confirmMarkAll = () =>
    Alert.alert(
      "Mark everything as read?",
      "Your reading progress moves to the latest chapter of every title with something new.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark all read", onPress: () => markAll.mutate(feed.fresh) },
      ],
    );

  const subtitle =
    feed.items.length === 0 ? null : feed.unreadCount > 0 ? (
      <>
        <Text style={{ color: palette.primary, fontWeight: "700" }}>{feed.unreadCount} new</Text>
        {` · ${feed.items.length} recent`}
      </>
    ) : (
      "You're all caught up"
    );

  const markAllButton =
    feed.unreadCount > 0 ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Mark all read" hitSlop={10} onPress={confirmMarkAll} disabled={markAll.isPending} style={styles.markAll}>
        <Ionicons name="checkmark-done" size={17} color={palette.primary} />
        <Text style={styles.markAllText}>Mark all read</Text>
      </Pressable>
    ) : null;

  if (feed.error) {
    return (
      <Screen padded={false}>
        <ScreenHeader title="Updates" />
        <ErrorNote title="Couldn't load your updates" message={feed.error.message} onRetry={() => feed.refetch()} />
      </Screen>
    );
  }

  const header = (
    <>
      <ScreenHeader title="Updates" subtitle={subtitle} right={markAllButton} />
      {feed.items.length > 0 ? (
        <FeedFilter value={filter} counts={{ all: feed.items.length, new: feed.unreadCount }} onChange={setFilter} />
      ) : null}
    </>
  );

  return (
    <Screen padded={false}>
      <SectionList
        sections={feed.isLoading ? [] : sections}
        keyExtractor={(i) => i.key}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={feed.refetch} tintColor={palette.primary} colors={[palette.primary]} progressBackgroundColor={palette.card} />}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={[styles.group, section.group === "today" && { color: palette.primary }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <FeedRow item={item} now={now} onPress={() => openChapter(item)} />
          </View>
        )}
        ListEmptyComponent={
          feed.isLoading ? (
            <Loading />
          ) : feed.items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="flash-outline" size={44} color={palette.faint} />
              <Text style={styles.emptyTitle}>Nothing yet</Text>
              <Text style={styles.emptyHint}>New chapters of the titles you track show up here as they come out.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.face}>
                <Ionicons name="happy-outline" size={34} color={palette.primary} />
              </View>
              <Text style={styles.emptyTitle}>You're all caught up!</Text>
              <Text style={styles.emptyHint}>No new chapters right now. Switch to All to see what you've already read.</Text>
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cell: { paddingHorizontal: 20, marginBottom: 10 },
  group: { color: palette.muted, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4, paddingHorizontal: 20, marginTop: 16, marginBottom: 10 },
  markAll: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,42,42,0.45)", backgroundColor: "rgba(255,42,42,0.08)" },
  markAllText: { color: palette.primary, fontSize: 13, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { color: palette.text, fontSize: 18, fontWeight: "800" },
  emptyHint: { color: palette.muted, textAlign: "center", lineHeight: 20 },
  face: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: palette.primaryDeep, backgroundColor: "rgba(255,42,42,0.1)" },
});
