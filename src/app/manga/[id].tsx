import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { trackingApi } from "@/api/endpoints";
import type { ReadingStatus } from "@/api/types";
import { Button, ErrorNote, Loading, Screen } from "@/components/ui";
import { spacing, useTheme } from "@/theme";

const STATUSES: { key: ReadingStatus; label: string }[] = [
  { key: "reading", label: "Reading" },
  { key: "plan_to_read", label: "Plan to read" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "dropped", label: "Dropped" },
];

export default function MangaDetail() {
  const t = useTheme();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackingId = Number(id);

  // The list endpoint already carries everything the detail view needs; no extra request.
  const q = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const item = q.data?.find((i) => i.id === trackingId);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tracked"] });
  const update = useMutation({
    mutationFn: (body: Parameters<typeof trackingApi.update>[1]) => trackingApi.update(trackingId, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => trackingApi.remove(trackingId),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorNote message={q.error.message} onRetry={() => q.refetch()} />;
  if (!item) return <ErrorNote message="This title is no longer in your library." />;

  const m = item.manga;
  const latestUrl = item.preferred_source_record?.latest_chapter_url ?? m.latest_chapter_url;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.lg }}>
          <Image source={m.cover_url ? { uri: m.cover_url } : undefined} style={{ width: 110, height: 156, borderRadius: 12, backgroundColor: t.border }} contentFit="cover" />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "700" }}>{m.canonical_name}</Text>
            {m.author ? <Text style={{ color: t.muted }}>{m.author}</Text> : null}
            <Text style={{ color: t.muted }}>Status: {item.user_status_override ?? m.global_status}</Text>
            <Text style={{ color: t.muted }}>Latest: {m.latest_chapter ?? "—"}</Text>
            <Text style={{ color: t.muted }}>You read: {item.last_chapter_read ?? "—"}</Text>
          </View>
        </View>

        {m.summary ? <Text style={{ color: t.text, lineHeight: 21 }}>{m.summary}</Text> : null}

        {latestUrl ? <Button title="Read latest chapter" onPress={() => WebBrowser.openBrowserAsync(latestUrl)} /> : null}
        {m.latest_chapter && m.latest_chapter !== item.last_chapter_read ? (
          <Button
            title={`Mark chapter ${m.latest_chapter} as read`}
            variant="ghost"
            loading={update.isPending}
            onPress={() => update.mutate({ last_chapter_read: m.latest_chapter, last_chapter_url: m.latest_chapter_url })}
          />
        ) : null}

        <Text style={{ color: t.muted, fontSize: 13 }}>Reading status</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {STATUSES.map((s) => (
            <Button
              key={s.key}
              title={s.label}
              variant={item.reading_status === s.key ? "primary" : "ghost"}
              onPress={() => update.mutate({ reading_status: s.key })}
            />
          ))}
        </View>

        <Button
          title={item.notifications_enabled ? "Notifications: on" : "Notifications: off"}
          variant="ghost"
          onPress={() => update.mutate({ notifications_enabled: !item.notifications_enabled })}
        />
        {update.isError ? <Text style={{ color: t.danger }}>{update.error.message}</Text> : null}
        <Button title="Remove from library" variant="danger" loading={remove.isPending} onPress={() => remove.mutate()} />
      </ScrollView>
    </Screen>
  );
}
