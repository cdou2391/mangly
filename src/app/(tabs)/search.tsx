import { useCallback, useMemo, useState } from "react";
import { FlatList, Keyboard, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { mangaApi, trackingApi } from "@/api/endpoints";
import { describeError } from "@/api/errors";
import { ErrorNote, Screen } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ResultCard } from "@/components/search/ResultCard";
import { ResultsSkeleton } from "@/components/search/ResultsSkeleton";
import { MIN_QUERY, SearchBar } from "@/components/search/SearchBar";
import { SourceFilter } from "@/components/search/SourceFilter";
import { useTrackTitle } from "@/hooks/useTrackTitle";
import { findInLibrary, groupCandidates, sourcesIn } from "@/utils/search";
import { palette } from "@/theme";

/** Find a title on the source sites and add it to the library. */
export default function Search() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<string | null>(null);

  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  // Searching can scrape the source sites and the server allows 20 searches a minute, so results are kept for a while and a failed
  // search is not retried behind the user's back.
  const results = useQuery({
    queryKey: ["search", query],
    queryFn: () => mangaApi.search(query),
    enabled: query.length >= MIN_QUERY,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { states, track } = useTrackTitle();

  const groups = useMemo(() => groupCandidates(results.data), [results.data]);
  const sources = useMemo(() => sourcesIn(groups), [groups]);
  const shown = useMemo(() => (source ? groups.filter((g) => g.candidates.some((c) => c.source === source)) : groups), [groups, source]);

  const submit = useCallback(() => {
    const q = text.trim().replace(/\s+/g, " ");
    if (q.length < MIN_QUERY) return;
    Keyboard.dismiss();
    setSource(null);
    if (q === query) void results.refetch(); // the same words again: look again
    else setQuery(q);
  }, [text, query, results]);

  const header = (
    <>
      <ScreenHeader title="Search" />
      <SearchBar value={text} onChange={setText} onSubmit={submit} />
      {results.data && groups.length > 0 ? (
        <View style={styles.summary}>
          <Text style={styles.count}>
            {shown.length} {shown.length === 1 ? "title" : "titles"} for “{query}”
          </Text>
          <SourceFilter sources={sources} value={source} onChange={setSource} />
        </View>
      ) : (
        <View style={{ height: 18 }} />
      )}
    </>
  );

  let body: React.ReactElement | null = null;
  if (query === "") {
    body = (
      <View style={styles.empty}>
        <View style={styles.ring}>
          <Ionicons name="search" size={30} color={palette.primary} />
        </View>
        <Text style={styles.emptyTitle}>Find your next read</Text>
        <Text style={styles.emptyHint}>Search MangaRead and WeebCentral by title. Add one and you'll hear about every new chapter.</Text>
      </View>
    );
  } else if (results.isLoading) {
    body = (
      <>
        <Text style={styles.searching}>Searching MangaRead and WeebCentral…</Text>
        <ResultsSkeleton />
      </>
    );
  } else if (results.isError) {
    body = <ErrorNote title="Search failed" message={describeError(results.error, "search")} onRetry={() => results.refetch()} />;
  } else if (groups.length === 0) {
    body = (
      <View style={styles.empty}>
        <Ionicons name="sad-outline" size={44} color={palette.faint} />
        <Text style={styles.emptyTitle}>No results for “{query}”</Text>
        <Text style={styles.emptyHint}>Check the spelling, or try fewer words. The English title usually works best.</Text>
      </View>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={body ? [] : shown}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const match = findInLibrary(item, tracked.data);
          const state = states[item.key];
          const trackingId = match?.id ?? (state?.phase === "added" ? state.trackingId : null);
          return (
            <View style={styles.cell}>
              <ResultCard
                group={item}
                inLibrary={!!match}
                state={state}
                onTrack={() => void track(item, source)}
                onOpen={() => trackingId !== null && router.push({ pathname: "/manga/[id]", params: { id: String(trackingId) } })}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 16, marginBottom: 14, gap: 12 },
  count: { color: palette.muted, fontSize: 13, paddingHorizontal: 20 },
  cell: { paddingHorizontal: 20, marginBottom: 10 },
  searching: { color: palette.muted, fontSize: 13, paddingHorizontal: 20, marginTop: 16, marginBottom: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 36, paddingBottom: 80 },
  ring: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: palette.primaryDeep, backgroundColor: "rgba(255,42,42,0.1)", marginBottom: 6 },
  emptyTitle: { color: palette.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyHint: { color: palette.muted, textAlign: "center", lineHeight: 20 },
});
