import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import type { ReadingStatus } from "@/api/types";
import { Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { MangaRow } from "@/components/MangaRow";
import { spacing, useTheme } from "@/theme";

const FILTERS: { key: ReadingStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reading", label: "Reading" },
  { key: "plan_to_read", label: "Plan" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Done" },
  { key: "dropped", label: "Dropped" },
];

export default function Library() {
  const t = useTheme();
  const [filter, setFilter] = useState<ReadingStatus | "all">("reading");
  const q = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });

  const items = useMemo(() => {
    const all = q.data ?? [];
    return filter === "all" ? all : all.filter((i) => i.reading_status === filter);
  }, [q.data, filter]);

  return (
    <Screen padded={false}>
      <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", padding: spacing.lg, paddingBottom: spacing.sm }}>
        Library
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: filter === f.key ? t.primary : t.card,
              borderWidth: 1,
              borderColor: filter === f.key ? t.primary : t.border,
            }}
          >
            <Text style={{ color: filter === f.key ? t.onPrimary : t.text, fontSize: 13 }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorNote message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={<Empty title="Nothing here yet" hint="Use Search to add a title to your library." />}
          renderItem={({ item }) => (
            <MangaRow
              title={item.manga.canonical_name}
              coverUrl={item.manga.cover_url}
              subtitle={`Read: ${item.last_chapter_read ?? "—"}  ·  Latest: ${item.manga.latest_chapter ?? "—"}`}
              badge={
                item.manga.latest_chapter && item.manga.latest_chapter !== item.last_chapter_read
                  ? "New chapter available"
                  : undefined
              }
              onPress={() => router.push({ pathname: "/manga/[id]", params: { id: String(item.id) } })}
            />
          )}
        />
      )}
    </Screen>
  );
}
