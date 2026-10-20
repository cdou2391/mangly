import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import type { ReadingStatus, TrackedManga, TrackedMangaUpdate } from "@/api/types";
import { BackBar } from "@/components/detail/BackBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Cover } from "@/components/Cover";
import { ProgressEditor } from "@/components/detail/ProgressEditor";
import { RatingStars } from "@/components/detail/RatingStars";
import { useWarmBrowser } from "@/hooks/useWarmBrowser";
import { ErrorNote, Loading, Screen } from "@/components/ui";
import { isWebLink, openInBrowser } from "@/utils/browser";
import { chapterToStore, formatChapter, parseChapter, readProgress, shortChapter } from "@/utils/chapters";
import { savedChapterUrl } from "@/utils/continueReading";
import { sourceName } from "@/utils/sources";
import { palette } from "@/theme";

const STATUSES: { key: ReadingStatus; label: string }[] = [
  { key: "reading", label: "Reading" },
  { key: "plan_to_read", label: "Plan to read" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "dropped", label: "Dropped" },
];

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function MangaDetail() {
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackingId = Number(id);
  const [expanded, setExpanded] = useState(false);
  // What is typed in the "I'm up to chapter" field; null while it just follows the saved chapter.
  const [draft, setDraft] = useState<string | null>(null);

  // The list endpoint already carries everything the detail view needs; no extra request.
  const q = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const item = q.data?.find((i) => i.id === trackingId);
  // The latest chapter is the page most often opened from here, so the browser is told about it ahead of the tap.
  useWarmBrowser(item ? (item.preferred_source_record?.latest_chapter_url ?? item.manga.latest_chapter_url) : null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tracked"] });
  const update = useMutation({
    mutationFn: (body: Parameters<typeof trackingApi.update>[1]) => trackingApi.update(trackingId, body),
    onSuccess: async () => {
      setDraft(null);
      await invalidate();
      void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
    },
  });
  // Rating a title (or taking the rating back, with null) shows at once and is put back if it cannot be saved.
  const rate = useMutation<unknown, Error, number | null, { previous: TrackedManga[] | undefined }>({
    mutationFn: (rating) => trackingApi.update(trackingId, { rating }),
    onMutate: async (rating) => {
      await qc.cancelQueries({ queryKey: ["tracked"] });
      const previous = qc.getQueryData<TrackedManga[]>(["tracked"]);
      qc.setQueryData<TrackedManga[]>(["tracked"], (list) => list?.map((i) => (i.id === trackingId ? { ...i, rating } : i)));
      return { previous };
    },
    onError: (_error, _rating, context) => {
      if (context?.previous) qc.setQueryData(["tracked"], context.previous);
    },
    onSettled: () => invalidate(),
  });
  // Setting the chapter by hand shows at once and is put back if it cannot be saved. The link to the chapter is only
  // sent when it is known (the latest one); the server cannot clear a saved link, so a stale one is checked on display.
  const setProgress = useMutation<unknown, Error, TrackedMangaUpdate, { previous: TrackedManga[] | undefined }>({
    mutationFn: (body) => trackingApi.update(trackingId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["tracked"] });
      const previous = qc.getQueryData<TrackedManga[]>(["tracked"]);
      qc.setQueryData<TrackedManga[]>(["tracked"], (list) => list?.map((i) => (i.id === trackingId ? { ...i, ...body } as TrackedManga : i)));
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) qc.setQueryData(["tracked"], context.previous);
    },
    onSuccess: () => setDraft(null),
    onSettled: async () => {
      await invalidate();
      void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => trackingApi.remove(trackingId),
    onSuccess: async () => {
      await invalidate();
      void qc.invalidateQueries({ queryKey: ["recent-chapters"] });
      router.back();
    },
  });

  const [confirmingRemove, setConfirmingRemove] = useState(false);

  if (q.isLoading || remove.isSuccess) {
    return (
      <Screen padded={false}>
        <BackBar />
        <Loading />
      </Screen>
    );
  }
  if (q.isError && !q.data) {
    return (
      <Screen padded={false}>
        <BackBar />
        <ErrorNote title="Couldn't load this title" message={q.error.message} onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen padded={false}>
        <BackBar />
        <ErrorNote title="Not in your library" message="This title is no longer in your library." />
      </Screen>
    );
  }

  const m = item.manga;
  const latestUrl = item.preferred_source_record?.latest_chapter_url ?? m.latest_chapter_url;
  // The first chapter's link is kept by the server (null until it has looked it up); opening it never changes your progress.
  const firstUrl = isWebLink(item.preferred_source_record?.first_chapter_url) ? item.preferred_source_record!.first_chapter_url! : null;
  const status = item.user_status_override ?? m.global_status;
  const site = item.preferred_source_record ? sourceName(item.preferred_source_record.source) : null;
  const read = shortChapter(item.last_chapter_read);
  const latest = shortChapter(m.latest_chapter);
  const progress = readProgress(item.last_chapter_read, m.latest_chapter);
  // "Behind" is judged by chapter number, so "Chapter 700.5" against a saved "700.5" counts as caught up.
  const lr = parseChapter(item.last_chapter_read);
  const ll = parseChapter(m.latest_chapter);
  const behind = !!m.latest_chapter && (lr === null || ll === null ? m.latest_chapter !== item.last_chapter_read : ll > lr);
  // The chapter link saved with the progress, unless it is plainly for another chapter than the one the reader is on.
  const continueUrl = savedChapterUrl(item);
  const sourceUrl = item.preferred_source_record?.manga_details_url ?? null;
  const saveProgress = (chapter: number) =>
    setProgress.mutate({
      last_chapter_read: formatChapter(chapter),
      ...(ll !== null && chapter === ll && m.latest_chapter_url ? { last_chapter_url: m.latest_chapter_url } : {}),
    });
  const longSummary = (m.summary?.length ?? 0) > 220;

  return (
    <Screen padded={false}>
      <BackBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Cover uri={m.cover_url} style={styles.cover} />
          <View style={styles.heroText}>
            <Text accessibilityRole="header" style={styles.title}>
              {m.canonical_name}
            </Text>
            {m.author ? <Text style={styles.author}>{m.author}</Text> : null}
            <View style={styles.pills}>
              {status && status !== "unknown" ? <Pill label={titleCase(status)} /> : null}
              {site ? <Pill label={site} /> : null}
            </View>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <View>
              <Text style={styles.progressLabel}>YOU READ</Text>
              <Text style={styles.progressValue}>{read ?? "Not started"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.progressLabel}>LATEST</Text>
              <Text style={styles.progressValue}>{latest ?? "—"}</Text>
            </View>
          </View>
          {progress !== null ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}
          <View style={styles.editor}>
            <ProgressEditor saved={item.last_chapter_read} text={draft ?? (lr === null ? "" : formatChapter(lr))} onText={setDraft} busy={setProgress.isPending} onSave={saveProgress} />
          </View>
          {setProgress.isError ? (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { marginTop: 10 }]}>
              {setProgress.error.message}
            </Text>
          ) : null}
        </View>

        {latestUrl || firstUrl ? (
          <View style={styles.readRow}>
            {firstUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read first chapter"
                onPress={() => openInBrowser(firstUrl)}
                style={({ pressed }) => [latestUrl ? styles.readFirst : styles.primary, !latestUrl && { flex: 1 }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="play-skip-back-outline" size={19} color={latestUrl ? palette.text : "#fff"} />
                <Text style={latestUrl ? styles.readFirstText : styles.primaryText}>{latestUrl ? "First chapter" : "Read first chapter"}</Text>
              </Pressable>
            ) : null}
            {latestUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read latest chapter"
                onPress={() => openInBrowser(latestUrl)}
                style={({ pressed }) => [styles.primary, { flex: firstUrl ? 1.25 : 1 }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="book-outline" size={19} color="#fff" />
                <Text style={styles.primaryText}>{firstUrl ? "Latest chapter" : "Read latest chapter"}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {behind ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${latest ?? "latest"} as read`}
            disabled={update.isPending}
            onPress={() => update.mutate({ last_chapter_read: chapterToStore(m.latest_chapter!), last_chapter_url: m.latest_chapter_url })}
            style={({ pressed }) => [styles.secondary, (pressed || update.isPending) && { opacity: 0.7 }]}
          >
            <Ionicons name="checkmark-done" size={19} color={palette.text} />
            <Text style={styles.secondaryText}>Mark {latest ?? "latest"} as read</Text>
          </Pressable>
        ) : null}

        {continueUrl || sourceUrl ? (
          <View style={styles.links}>
            {continueUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue reading"
                onPress={() => openInBrowser(continueUrl)}
                style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="play-outline" size={18} color={palette.text} />
                <Text style={styles.linkText}>Continue reading</Text>
              </Pressable>
            ) : null}
            {sourceUrl ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open on ${site ?? "the source site"}`}
                onPress={() => openInBrowser(sourceUrl)}
                style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="open-outline" size={18} color={palette.text} />
                <Text style={styles.linkText}>Open on {site ?? "the site"}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {m.summary ? (
          <View>
            <Text style={styles.sectionLabel}>ABOUT</Text>
            <Text numberOfLines={expanded ? undefined : 4} style={styles.summary}>
              {m.summary}
            </Text>
            {longSummary ? (
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded((e) => !e)}>
                <Text style={styles.more}>{expanded ? "Show less" : "Read more"}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View>
          <Text style={styles.sectionLabel}>READING STATUS</Text>
          <View style={styles.chips}>
            {STATUSES.map((s) => {
              const on = item.reading_status === s.key;
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  disabled={update.isPending}
                  onPress={() => !on && update.mutate({ reading_status: s.key })}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel}>YOUR RATING</Text>
          <RatingStars value={item.rating} busy={rate.isPending} onRate={(n) => rate.mutate(n)} onClear={() => rate.mutate(null)} />
          {rate.isError ? (
            <Text accessibilityLiveRegion="polite" style={[styles.error, { marginTop: 8 }]}>
              {rate.error.message}
            </Text>
          ) : null}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>New chapter alerts</Text>
            <Text style={styles.rowHint}>Get notified when a new chapter comes out.</Text>
          </View>
          <Switch
            accessibilityLabel="New chapter alerts"
            value={item.notifications_enabled}
            disabled={update.isPending}
            onValueChange={(v) => update.mutate({ notifications_enabled: v })}
            trackColor={{ false: "#2A2A2E", true: palette.primaryDeep }}
            thumbColor={item.notifications_enabled ? palette.primary : "#8E8E93"}
          />
        </View>

        {update.isError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {update.error.message}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remove from library"
          disabled={remove.isPending}
          onPress={() => setConfirmingRemove(true)}
          style={({ pressed }) => [styles.remove, (pressed || remove.isPending) && { opacity: 0.7 }]}
        >
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
          <Text style={styles.removeText}>Remove from library</Text>
        </Pressable>
        {remove.isError ? <Text style={styles.error}>{remove.error.message}</Text> : null}
      </ScrollView>
      <ConfirmDialog
        visible={confirmingRemove}
        icon="trash-outline"
        destructive
        title="Remove from library?"
        message="You'll stop getting updates for this title, and your reading progress is deleted."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={() => {
          setConfirmingRemove(false);
          remove.mutate();
        }}
      >
        <View style={styles.removing}>
          <Cover uri={m.cover_url} style={styles.removingCover} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={styles.removingTitle}>
              {m.canonical_name}
            </Text>
            {read ? <Text style={styles.removingMeta}>You're on {read}</Text> : null}
          </View>
        </View>
      </ConfirmDialog>
    </Screen>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 20 },
  hero: { flexDirection: "row", gap: 16 },
  cover: { width: 118, height: 170, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  heroText: { flex: 1, justifyContent: "center", gap: 6 },
  title: { color: palette.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, lineHeight: 28 },
  author: { color: palette.muted, fontSize: 14 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pill: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { color: "#C8C8CC", fontSize: 12, fontWeight: "700" },
  progressCard: { borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 16 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressLabel: { color: palette.faint, fontSize: 11, fontWeight: "800", letterSpacing: 1.8 },
  progressValue: { color: palette.text, fontSize: 17, fontWeight: "800", marginTop: 4 },
  track: { height: 5, borderRadius: 3, backgroundColor: "#262626", marginTop: 14, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: palette.primary },
  editor: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  links: { flexDirection: "row", gap: 10, marginTop: -8 },
  link: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, height: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: palette.card },
  linkText: { color: palette.text, fontSize: 14, fontWeight: "700" },
  readRow: { flexDirection: "row", gap: 10 },
  readFirst: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: palette.card },
  readFirstText: { color: palette.text, fontSize: 15, fontWeight: "800" },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, height: 52, borderRadius: 14, backgroundColor: palette.primary },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  secondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, height: 50, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: palette.card, marginTop: -8 },
  secondaryText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  sectionLabel: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4, marginBottom: 10 },
  summary: { color: "#D7D7DA", fontSize: 15, lineHeight: 22 },
  more: { color: palette.primary, fontSize: 14, fontWeight: "700", marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { color: "#C8C8CC", fontSize: 14, fontWeight: "700" },
  chipTextOn: { color: "#fff" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  rowTitle: { color: palette.text, fontSize: 15.5, fontWeight: "700" },
  rowHint: { color: palette.muted, fontSize: 13, marginTop: 3 },
  error: { color: palette.danger, fontSize: 13.5, lineHeight: 19 },
  remove: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,90,90,0.4)", backgroundColor: "rgba(255,90,90,0.07)", marginTop: 4 },
  removing: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", borderRadius: 14, backgroundColor: palette.raised, padding: 10 },
  removingCover: { width: 40, height: 58, borderRadius: 7 },
  removingTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  removingMeta: { color: palette.muted, fontSize: 12.5, marginTop: 3 },
  removeText: { color: palette.danger, fontSize: 15, fontWeight: "700" },
});
