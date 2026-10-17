import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Cover } from "@/components/Cover";
import type { TrackState } from "@/hooks/useTrackTitle";
import { sourceName } from "@/utils/sources";
import type { TitleGroup } from "@/utils/search";
import { palette } from "@/theme";

const statusLabel = (s: string | null) => (s && s !== "unknown" ? s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : null);

/** One title found by a search: what it is, where it can be read, and the way to add it (or the fact it is already added). */
export function ResultCard({
  group,
  inLibrary,
  state,
  onTrack,
  onOpen,
  onPreview,
}: {
  group: TitleGroup;
  inLibrary: boolean;
  state: TrackState | undefined;
  onTrack: () => void;
  /** Tapping a title that is in the library opens it there. */
  onOpen: () => void;
  /** Tapping any other title shows a preview of it. */
  onPreview: () => void;
}) {
  const adding = state?.phase === "adding";
  const failed = state?.phase === "failed";
  const added = inLibrary || state?.phase === "added";
  const facts = [group.author, statusLabel(group.status)].filter(Boolean) as string[];
  const meta = facts.join("  ·  "); // what is shown
  const sites = group.candidates.map((c) => sourceName(c.source));
  const spoken = [group.title, ...facts, `On ${sites.join(" and ")}`, added ? "In your library" : null].filter(Boolean).join(". "); // what a screen reader says

  return (
    <View style={styles.card}>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={added ? "Opens it in your library" : "Shows a preview"}
        onPress={added ? onOpen : onPreview}
        style={styles.main}
      >
        <Cover uri={group.cover_url} style={styles.cover} />
        <View style={styles.body}>
          <Text numberOfLines={2} style={styles.title}>
            {group.title}
          </Text>
          {meta ? (
            <Text numberOfLines={1} style={styles.meta}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.sites}>
            {sites.map((s) => (
              <View key={s} style={styles.site}>
                <Text style={styles.siteText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
      </Pressable>

      <View style={styles.action}>
        {added ? (
          <View accessible accessibilityLabel="In library" style={styles.inLibrary}>
            <Ionicons name="checkmark-circle" size={18} color={palette.success} />
            <Text style={styles.inLibraryText}>In library</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${failed ? "Retry adding" : "Track"} ${group.title}`}
            accessibilityState={{ busy: adding, disabled: adding }}
            disabled={adding}
            onPress={onTrack}
            style={({ pressed }) => [styles.track, adding && styles.trackBusy, pressed && { opacity: 0.85 }]}
          >
            {adding ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={failed ? "refresh" : "add"} size={18} color="#fff" />}
            <Text style={styles.trackText}>{adding ? "Adding" : failed ? "Retry" : "Track"}</Text>
          </Pressable>
        )}
      </View>

      {failed ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {state.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 10 },
  main: { flex: 1, flexDirection: "row", gap: 13, minWidth: 0 },
  cover: { width: 60, height: 86, borderRadius: 9 },
  body: { flex: 1, minWidth: 0, justifyContent: "center" },
  title: { color: palette.text, fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  meta: { color: palette.muted, fontSize: 12.5, marginTop: 4 },
  sites: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 },
  site: { borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", paddingHorizontal: 7, paddingVertical: 2 },
  siteText: { color: "#B8B8BD", fontSize: 11, fontWeight: "700" },
  action: { paddingLeft: 10 },
  track: { flexDirection: "row", alignItems: "center", gap: 5, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: palette.primary },
  trackBusy: { backgroundColor: palette.primaryDeep },
  trackText: { color: "#fff", fontSize: 13.5, fontWeight: "800" },
  inLibrary: { flexDirection: "row", alignItems: "center", gap: 5, height: 38, paddingHorizontal: 4 },
  inLibraryText: { color: palette.success, fontSize: 13, fontWeight: "700" },
  error: { width: "100%", color: palette.danger, fontSize: 12.5, lineHeight: 17, marginTop: 10, paddingHorizontal: 4 },
});
