import { FlatList, RefreshControl, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { notificationsApi } from "@/api/endpoints";
import { Button, Empty, ErrorNote, Loading, Screen } from "@/components/ui";
import { MangaRow } from "@/components/MangaRow";
import { spacing, useTheme } from "@/theme";

export default function Notifications() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: notificationsApi.list });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh });

  return (
    <Screen padded={false}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: "800" }}>Alerts</Text>
        <Button title="Mark all read" variant="ghost" onPress={() => markAll.mutate()} loading={markAll.isPending} />
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorNote message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={<Empty title="All caught up" hint="You'll be notified when a tracked title gets a new chapter." />}
          renderItem={({ item }) => (
            <MangaRow
              title={item.manga.canonical_name}
              coverUrl={item.manga.cover_url}
              subtitle={`Chapter ${item.chapter_released} · ${item.source}`}
              badge={item.is_read ? undefined : "UNREAD"}
              onPress={() => {
                if (!item.is_read) markRead.mutate(item.id);
                if (item.latest_chapter_url) WebBrowser.openBrowserAsync(item.latest_chapter_url);
              }}
            />
          )}
        />
      )}
    </Screen>
  );
}
