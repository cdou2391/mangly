import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { trackingApi } from "@/api/endpoints";
import { describeError } from "@/api/errors";
import { MOODS, MOOD_FEATURE, type MoodKey } from "@/api/types";
import { useFeature } from "@/auth/AuthContext";
import { BackBar } from "@/components/detail/BackBar";
import { MoodPickCard } from "@/components/mood/MoodPickCard";
import { Screen } from "@/components/ui";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { useMoodPicks } from "@/hooks/useMoodPicks";
import { palette } from "@/theme";

/** How long the reader's note may be (the server allows more; this is what fits a short line). */
const CONTEXT_MAX = 200;

/** Picks by mood: choose how you feel, optionally add a note, and an AI suggests five titles. */
export default function Mood() {
  const enabled = useFeature(MOOD_FEATURE);
  const keyboard = useKeyboardHeight();
  const { result, ask, last } = useMoodPicks();
  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const [mood, setMood] = useState<MoodKey | null>(() => (MOODS.find((m) => m.key === last?.mood)?.key ?? null));
  const [note, setNote] = useState("");

  const trackingIdOf = (mangaId: number | null) => (mangaId === null ? null : (tracked.data?.find((t) => t.manga_id === mangaId)?.id ?? null));
  // A ref, not the pending flag: two taps in the same instant both see "not pending" until the screen has redrawn, and each request spends one of the day's.
  const sending = useRef(false);
  const submit = () => {
    if (!mood || sending.current) return;
    sending.current = true;
    ask.mutate({ mood, context: note.trim() || undefined }, { onSettled: () => (sending.current = false) });
  };

  if (!enabled) {
    return (
      <Screen padded={false}>
        <BackBar />
        <View style={styles.off}>
          <Text accessibilityRole="header" style={styles.title}>
            Pick by mood
          </Text>
          <Text style={styles.lead}>Mood picks aren't enabled for your account.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <BackBar />
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: 40 + keyboard }]}>
        <View>
          <Text accessibilityRole="header" style={styles.title}>
            Pick by mood
          </Text>
          <Text style={styles.lead}>How are you feeling? An AI suggests five titles to match. Each request counts toward a daily limit shared with other AI features.</Text>
        </View>

        <View style={styles.grid} accessibilityRole="radiogroup">
          {MOODS.map((m) => {
            const on = mood === m.key;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                accessibilityLabel={m.label}
                disabled={ask.isPending}
                onPress={() => setMood(m.key)}
                style={[styles.tile, on && styles.tileOn]}
              >
                <Text style={styles.emoji}>{m.emoji}</Text>
                <Text style={[styles.tileText, on && styles.tileTextOn]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          accessibilityLabel="Anything else, optional"
          value={note}
          onChangeText={setNote}
          editable={!ask.isPending}
          maxLength={CONTEXT_MAX}
          placeholder='Anything else? e.g. "something short"'
          placeholderTextColor={palette.faint}
          returnKeyType="go"
          onSubmitEditing={submit}
          style={styles.input}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get picks"
          accessibilityState={{ disabled: !mood || ask.isPending, busy: ask.isPending }}
          disabled={!mood || ask.isPending}
          onPress={submit}
          style={({ pressed }) => [styles.primary, (!mood || ask.isPending) && styles.primaryOff, pressed && { opacity: 0.85 }]}
        >
          {ask.isPending ? <ActivityIndicator size="small" color="#fff" /> : null}
          <Text style={styles.primaryText}>{ask.isPending ? "Finding picks…" : "Get picks"}</Text>
        </Pressable>
        {ask.isPending ? <Text style={styles.wait}>This can take up to a minute.</Text> : null}

        {ask.isError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {describeError(ask.error, "mood")}
          </Text>
        ) : null}

        {result ? (
          <View style={{ gap: 12 }}>
            <View style={styles.analysis}>
              <Text style={styles.analysisText}>{result.mood_analysis}</Text>
            </View>
            {result.recommendations.map((pick, i) => (
              <MoodPickCard
                key={`${pick.title}-${i}`}
                pick={pick}
                trackingId={trackingIdOf(pick.manga_id)}
                onOpen={(id) => router.push({ pathname: "/manga/[id]", params: { id: String(id) } })}
                onFind={(title) => router.navigate({ pathname: "/search", params: { q: title, t: String(Date.now()) } })}
              />
            ))}
            <Text style={styles.powered}>Suggested by {result.generated_by === "anthropic" ? "Claude (Anthropic)" : result.generated_by === "openai" ? "OpenAI" : "an AI model"}. Titles may not exist on every site.</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, gap: 18 },
  off: { paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  title: { color: palette.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  lead: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  tile: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10, height: 56, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  tileOn: { borderColor: palette.primary, backgroundColor: "rgba(255,42,42,0.12)" },
  emoji: { fontSize: 22 },
  tileText: { color: "#D7D7DA", fontSize: 15, fontWeight: "700" },
  tileTextOn: { color: palette.text },
  input: { height: 50, borderRadius: 14, paddingHorizontal: 14, color: palette.text, fontSize: 15.5, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 14, backgroundColor: palette.primary },
  primaryOff: { backgroundColor: palette.primaryDeep, opacity: 0.5 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  wait: { color: palette.muted, fontSize: 13, textAlign: "center", marginTop: -8 },
  error: { color: palette.danger, fontSize: 14, lineHeight: 20, textAlign: "center" },
  analysis: { padding: 16, borderRadius: 16, backgroundColor: "rgba(255,42,42,0.08)", borderWidth: 1, borderColor: "rgba(255,42,42,0.25)" },
  analysisText: { color: "#E6E6E8", fontSize: 14.5, lineHeight: 21 },
  powered: { color: palette.faint, fontSize: 12, textAlign: "center", lineHeight: 17 },
});
