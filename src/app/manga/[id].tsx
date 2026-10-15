import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { trackingApi } from "@/api/endpoints";
import type { ReadingStatus } from "@/api/types";
import { BackBar } from "@/components/detail/BackBar";
import { Cover } from "@/components/Cover";
import { ErrorNote, Loading, Screen } from "@/components/ui";
import { chapterToStore, parseChapter, readProgress, shortChapter } from "@/utils/chapters";
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

  // The list endpoint already carries everything the detail view needs; no extra request.
  const q = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const item = q.data?.find((i) => i.id === trackingId);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tracked"] });
  const update = useMutation({
    mutationFn: (body: Parameters<typeof trackingApi.update>[1]) => trackingApi.update(trackingId, body),
    onSuccess: async () => {
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

  const confirmRemove = () =>
    Alert.alert("Remove from library?", "You'll stop getting updates for this title, and your reading progress is deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove.mutate() },
    ]);

  if (q.isLoading || remove.isSuccess) {
    return (
      <Screen padded={false}>
        <BackBar />
        <Loading />
      </Screen>
    );
  }
  if (q.isError) {
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
  const status = item.user_status_override ?? m.global_status;
  const site = item.preferred_source_record ? sourceName(item.preferred_source_record.source) : null;
  const read = shortChapter(item.last_chapter_read);
  const latest = shortChapter(m.latest_chapter);
  const progress = readProgress(item.last_chapter_read, m.latest_chapter);
  // "Behind" is judged by chapter number, so "Chapter 700.5" against a saved "700.5" counts as caught up.
  const lr = parseChapter(item.last_chapter_read);
  const ll = parseChapter(m.latest_chapter);
  const behind = !!m.latest_chapter && (lr === null || ll === null ? m.latest_chapter !== item.last_chapter_read : ll > lr);
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
        </View>

        {latestUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read latest chapter"
            onPress={() => WebBrowser.openBrowserAsync(latestUrl)}
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="book-outline" size={19} color="#fff" />
            <Text style={styles.primaryText}>Read latest chapter</Text>
          </Pressable>
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
          onPress={confirmRemove}
          style={({ pressed }) => [styles.remove, (pressed || remove.isPending) && { opacity: 0.7 }]}
        >
          <Ionicons name="trash-outline" size={18} color={palette.danger} />
          <Text style={styles.removeText}>Remove from library</Text>
        </Pressable>
        {remove.isError ? <Text style={styles.error}>{remove.error.message}</Text> : null}
      </ScrollView>
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
  removeText: { color: palette.danger, fontSize: 15, fontWeight: "700" },
});
