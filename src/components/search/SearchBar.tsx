import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette } from "@/theme";

export const MIN_QUERY = 2;

/** The search field: a clear button when there is text, and a red go button once the query is long enough. */
export function SearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const ready = value.trim().length >= MIN_QUERY;

  return (
    <View style={[styles.bar, focused && styles.focused]}>
      <Ionicons name="search" size={20} color={focused ? palette.text : palette.faint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={() => ready && onSubmit()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="Search for a title"
        placeholder="Search manga by title"
        placeholderTextColor={palette.faint}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={80}
        selectionColor={palette.primary}
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={20} color={palette.faint} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        hitSlop={6}
        onPress={onSubmit}
        style={[styles.go, !ready && styles.goOff]}
      >
        <Ionicons name="arrow-forward" size={18} color={ready ? "#fff" : palette.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, height: 54, marginHorizontal: 20, paddingLeft: 16, paddingRight: 8, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  focused: { borderColor: palette.primary },
  input: { flex: 1, color: palette.text, fontSize: 16, paddingVertical: 0, height: "100%" },
  go: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary },
  goOff: { backgroundColor: palette.raised },
});
