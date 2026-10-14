import { FlatList, RefreshControl, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { trackingApi } from "@/api/endpoints";
import { Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { MangaRow } from "@/components/MangaRow";
import { spacing, useTheme } from "@/theme";

export default function Updates() {
  const t = useTheme();
  const q = useQuery({ queryKey: ["recent-chapters"], queryFn: trackingApi.recentChapters });

  return (
    <Screen padded={false}>
      <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", padding: spacing.lg, paddingBottom: spacing.sm }}>
        Updates
      </Text>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorNote message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(c) => `${c.tracking_id}-${c.chapter}-${c.source}`}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={<Empty title="No recent chapters" hint="New releases for your tracked titles show up here." />}
          renderItem={({ item }) => (
            <MangaRow
              title={item.manga_title}
              coverUrl={item.manga_cover_url}
              subtitle={`Chapter ${item.chapter} · ${item.source}`}
              badge={item.is_new ? "NEW" : undefined}
              onPress={item.chapter_url ? () => WebBrowser.openBrowserAsync(item.chapter_url!) : undefined}
            />
          )}
        />
      )}
    </Screen>
  );
}
