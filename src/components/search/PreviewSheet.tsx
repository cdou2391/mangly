import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { describeError } from "@/api/errors";
import { Cover } from "@/components/Cover";
import { useMangaPreview } from "@/hooks/useMangaPreview";
import type { TrackState } from "@/hooks/useTrackTitle";
import { shortChapter } from "@/utils/chapters";
import { formatWhen } from "@/utils/feed";
import type { TitleGroup } from "@/utils/search";
import { sourceName } from "@/utils/sources";
import { palette } from "@/theme";

const statusLabel = (s: string | null) => (s && s !== "unknown" ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null);

/**
 * A look at a search result before it is tracked: the summary, genres and latest chapter, from the source site. It opens over
 * the results and shows what the search already knew straight away, then fills in the rest. A title found on several sites
 * can be looked at on each; tracking from here prefers the site being looked at.
 */
export function PreviewSheet({
  group,
  preferredSource,
  inLibrary,
  state,
  onTrack,
  onOpenLibrary,
  onClose,
}: {
  /** The title to preview; null keeps the sheet closed. */
  group: TitleGroup | null;
  /** The site the results are filtered to, which is the one shown first. */
  preferredSource: string | null;
  inLibrary: boolean;
  state: TrackState | undefined;
  onTrack: (source: string) => void;
  /** Opens the title in the library; null when it is there but its place is not known yet. */
  onOpenLibrary: (() => void) | null;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const candidate = group ? (group.candidates.find((c) => c.source === picked) ?? group.candidates.find((c) => c.source === preferredSource) ?? group.candidates[0]) : null;
  const preview = useMangaPreview(candidate);
  const d = preview.data;

  const adding = state?.phase === "adding";
  const failed = state?.phase === "failed";
  const added = inLibrary || state?.phase === "added";
  const close = () => {
    setPicked(null);
    setExpanded(false);
    onClose();
  };

  const facts = [d?.author ?? group?.author, statusLabel(d?.status ?? group?.status ?? null)].filter(Boolean) as string[];
  const latest = shortChapter(d?.latest_chapter);
  const when = formatWhen(d?.latest_chapter_at ?? null);
  const summary = d?.summary?.trim();

  return (
    <Modal visible={group !== null} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable accessibilityLabel="Close preview" style={styles.backdrop} onPress={close}>
        {/* A tap on the sheet itself must not fall through to the backdrop and close it. */}
        <Pressable testID="preview-sheet" accessible={false} onPress={() => undefined} style={styles.sheet} accessibilityViewIsModal>
          {group && candidate ? (
            <>
              <View style={styles.handle} />
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <View style={styles.hero}>
                  <Cover uri={d?.cover_url ?? candidate.cover_url ?? group.cover_url} style={styles.cover} />
                  <View style={styles.heroText}>
                    <Text accessibilityRole="header" style={styles.title}>
                      {d?.title ?? group.title}
                    </Text>
                    {facts.length ? <Text style={styles.meta}>{facts.join("  ·  ")}</Text> : null}
                    {latest ? (
                      <Text style={styles.latest}>
                        Latest {latest}
                        {when ? `  ·  ${when}` : ""}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {group.candidates.length > 1 ? (
                  <View style={styles.sites}>
                    {group.candidates.map((c) => {
                      const on = c.source === candidate.source;
                      return (
                        <Pressable
                          key={c.source}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`Preview from ${sourceName(c.source)}`}
                          onPress={() => {
                            setPicked(c.source);
                            setExpanded(false);
                          }}
                          style={[styles.site, on && styles.siteOn]}
                        >
                          <Text style={[styles.siteText, on && styles.siteTextOn]}>{sourceName(c.source)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.from}>From {sourceName(candidate.source)}</Text>
                )}

                {preview.isLoading ? (
                  <View accessibilityLabel="Loading the preview" style={styles.loading}>
                    <ActivityIndicator color={palette.primary} />
                    <Text style={styles.loadingText}>Asking {sourceName(candidate.source)}…</Text>
                  </View>
                ) : preview.isError ? (
                  <View style={styles.failure}>
                    <Text accessibilityLiveRegion="polite" style={styles.failureText}>
                      {describeError(preview.error, "preview")}
                    </Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Retry preview" onPress={() => preview.refetch()} style={styles.retry}>
                      <Ionicons name="refresh" size={16} color={palette.primary} />
                      <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : d ? (
                  <>
                    {d.genres.length ? (
                      <View style={styles.genres}>
                        {d.genres.map((g) => (
                          <View key={g} style={styles.genre}>
                            <Text style={styles.genreText}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {summary ? (
                      <View>
                        <Text numberOfLines={expanded ? undefined : 6} style={styles.summary}>
                          {summary}
                        </Text>
                        {summary.length > 280 ? (
                          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setExpanded((e) => !e)}>
                            <Text style={styles.more}>{expanded ? "Show less" : "Read more"}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.from}>This site has no summary for it.</Text>
                    )}
                  </>
                ) : null}
              </ScrollView>

              <View style={styles.footer}>
                {failed ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {state.message}
                  </Text>
                ) : null}
                {added ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Open in library" onPress={() => onOpenLibrary?.()} disabled={!onOpenLibrary} style={styles.inLibrary}>
                    <Ionicons name="checkmark-circle" size={19} color={palette.success} />
                    <Text style={styles.inLibraryText}>In your library</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${failed ? "Retry adding" : "Track"} ${group.title}`}
                    accessibilityState={{ busy: adding, disabled: adding }}
                    disabled={adding}
                    onPress={() => onTrack(candidate.source)}
                    style={({ pressed }) => [styles.track, adding && styles.trackBusy, pressed && { opacity: 0.85 }]}
                  >
                    {adding ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={failed ? "refresh" : "add"} size={20} color="#fff" />}
                    <Text style={styles.trackText}>{adding ? "Adding" : failed ? "Retry" : "Track this title"}</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.closeBtn}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { maxHeight: "88%", backgroundColor: palette.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingTop: 10 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 6 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 16 },
  hero: { flexDirection: "row", gap: 16 },
  cover: { width: 104, height: 150, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  heroText: { flex: 1, justifyContent: "center", gap: 6 },
  title: { color: palette.text, fontSize: 21, fontWeight: "800", letterSpacing: -0.4, lineHeight: 25 },
  meta: { color: palette.muted, fontSize: 13.5 },
  latest: { color: palette.primary, fontSize: 13.5, fontWeight: "700", marginTop: 2 },
  from: { color: palette.faint, fontSize: 13 },
  sites: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  site: { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: palette.raised, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  siteOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  siteText: { color: "#C8C8CC", fontSize: 13, fontWeight: "700" },
  siteTextOn: { color: "#fff" },
  loading: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  loadingText: { color: palette.muted, fontSize: 14 },
  failure: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: palette.raised, borderWidth: 1, borderColor: "rgba(255,42,42,0.35)" },
  failureText: { color: "#D7D7DA", fontSize: 14, lineHeight: 19 },
  retry: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  retryText: { color: palette.primary, fontSize: 14, fontWeight: "700" },
  genres: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  genre: { borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingHorizontal: 9, paddingVertical: 3 },
  genreText: { color: "#C8C8CC", fontSize: 12, fontWeight: "700" },
  summary: { color: "#D7D7DA", fontSize: 15, lineHeight: 22 },
  more: { color: palette.primary, fontSize: 14, fontWeight: "700", marginTop: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22, gap: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  error: { color: palette.danger, fontSize: 13, lineHeight: 18 },
  track: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, backgroundColor: palette.primary },
  trackBusy: { backgroundColor: palette.primaryDeep },
  trackText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  inLibrary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(61,220,151,0.4)", backgroundColor: "rgba(61,220,151,0.07)" },
  inLibraryText: { color: palette.success, fontSize: 16, fontWeight: "800" },
  closeBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { color: palette.muted, fontSize: 15, fontWeight: "700" },
});
