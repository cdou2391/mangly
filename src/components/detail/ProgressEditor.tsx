import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MAX_CHAPTER, parseChapter, parseDraft, stepChapter } from "@/utils/chapters";
import { palette } from "@/theme";

/**
 * "I'm up to chapter N": a number with a step down and a step up, and Save once it differs from what is saved.
 * For catching the tracker up after reading elsewhere, or taking it back after a mistaken tap on "Mark as read".
 * What is typed lives in the parent, so a save that fails leaves the reader's number in the field to try again.
 */
export function ProgressEditor({
  saved,
  text,
  onText,
  busy,
  onSave,
}: {
  /** The saved "last chapter read" label, if any. */
  saved: string | null;
  /** What the field shows, and the way to change it. */
  text: string;
  onText: (text: string) => void;
  busy: boolean;
  /** Called with the chapter number the reader chose. */
  onSave: (chapter: number) => void;
}) {
  const savedNumber = parseChapter(saved);
  const [focused, setFocused] = useState(false);

  const value = parseDraft(text);
  const invalid = text.trim() !== "" && value === null;
  const changed = value !== null && value !== savedNumber;
  const set = (next: string) => onText(next.replace(/[^0-9.,]/g, ""));

  return (
    <View>
      <Text style={styles.label}>I'M UP TO CHAPTER</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous chapter"
          disabled={busy || (value ?? 0) <= 0}
          onPress={() => set(stepChapter(text, -1))}
          style={({ pressed }) => [styles.step, ((value ?? 0) <= 0 || busy) && styles.stepOff, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="remove" size={22} color={palette.text} />
        </Pressable>
        <TextInput
          accessibilityLabel="Chapter you are up to"
          value={text}
          onChangeText={set}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!busy}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={palette.faint}
          maxLength={String(MAX_CHAPTER).length + 3}
          selectTextOnFocus
          style={[styles.input, focused && styles.focused, invalid && styles.invalid]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next chapter"
          disabled={busy || (value ?? 0) >= MAX_CHAPTER}
          onPress={() => set(stepChapter(text, 1))}
          style={({ pressed }) => [styles.step, busy && styles.stepOff, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="add" size={22} color={palette.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save progress"
          accessibilityState={{ disabled: !changed || busy, busy }}
          disabled={!changed || busy}
          onPress={() => value !== null && onSave(value)}
          style={({ pressed }) => [styles.save, (!changed || busy) && styles.saveOff, pressed && { opacity: 0.85 }]}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
        </Pressable>
      </View>
      {invalid ? (
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          Use a chapter number, like 188 or 188.5.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: palette.faint, fontSize: 11, fontWeight: "800", letterSpacing: 1.8, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  step: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.raised, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  stepOff: { opacity: 0.4 },
  input: { flex: 1, height: 44, borderRadius: 12, textAlign: "center", color: palette.text, fontSize: 17, fontWeight: "800", paddingVertical: 0, backgroundColor: palette.raised, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  focused: { borderColor: palette.primary },
  invalid: { borderColor: palette.danger },
  save: { minWidth: 66, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary, paddingHorizontal: 14 },
  saveOff: { backgroundColor: palette.primaryDeep, opacity: 0.45 },
  saveText: { color: "#fff", fontSize: 14.5, fontWeight: "800" },
  hint: { color: palette.danger, fontSize: 12.5, marginTop: 8 },
});
