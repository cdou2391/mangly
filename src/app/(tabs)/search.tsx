import { useState } from "react";
import { FlatList, Text } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mangaApi, trackingApi } from "@/api/endpoints";
import type { SearchCandidate } from "@/api/types";
import { Button, Empty, ErrorNote, Field, Loading, Screen } from "@/components/ui";
import { MangaRow } from "@/components/MangaRow";
import { spacing, useTheme } from "@/theme";

export default function Search() {
  const t = useTheme();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");

  const results = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => mangaApi.search(submitted),
    enabled: submitted.length >= 2,
  });

  const track = useMutation({
    mutationFn: (c: SearchCandidate) => trackingApi.fromSource({ url: c.url, source: c.source }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracked"] }),
  });

  return (
    <Screen>
      <Text style={{ color: t.text, fontSize: 26, fontWeight: "800", marginBottom: spacing.md }}>Search</Text>
      <Field
        label="Title"
        value={text}
        onChangeText={setText}
        returnKeyType="search"
        onSubmitEditing={() => setSubmitted(text.trim())}
        placeholder="At least 2 characters"
      />
      <Button title="Search" onPress={() => setSubmitted(text.trim())} disabled={text.trim().length < 2} />
      {track.isError ? <Text style={{ color: t.danger, marginTop: spacing.sm }}>{track.error.message}</Text> : null}
      {results.isFetching ? (
        <Loading />
      ) : results.isError ? (
        <ErrorNote message={results.error.message} onRetry={() => results.refetch()} />
      ) : (
        <FlatList
          data={results.data}
          keyExtractor={(c) => `${c.source}-${c.url}`}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.lg, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            submitted ? <Empty title="No results" /> : <Empty title="Find a title" hint="Searches MangaRead and WeebCentral." />
          }
          renderItem={({ item }) => {
            const adding = track.isPending && track.variables?.url === item.url;
            const added = track.isSuccess && track.variables?.url === item.url;
            return (
              <MangaRow
                title={item.title}
                coverUrl={item.cover_url}
                subtitle={[item.author, item.source].filter(Boolean).join(" · ")}
                right={
                  <Button
                    title={added ? "Added" : "Track"}
                    variant="ghost"
                    loading={adding}
                    disabled={added}
                    onPress={() => track.mutate(item)}
                  />
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
