import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SORTS, type SortKey } from "@/utils/libraryView";
import { palette } from "@/theme";

/**
 * The search field and the sort button above the Library list. The search is only among the titles already in the library,
 * so it needs no button: the list narrows as you type.
 */
export function LibraryControls({
  query,
  onQuery,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (text: string) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const current = SORTS.find((s) => s.key === sort) ?? SORTS[0];

  return (
    <View style={styles.row}>
      <View style={[styles.bar, focused && styles.focused]}>
        <Ionicons name="search" size={19} color={focused ? palette.text : palette.faint} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel="Search your library"
          placeholder="Search your library"
          placeholderTextColor={palette.faint}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={80}
          selectionColor={palette.primary}
          style={styles.input}
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onQuery("")}>
            <Ionicons name="close-circle" size={19} color={palette.faint} />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${current.label}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.sort, sort !== "behind" && styles.sortActive, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="swap-vertical" size={20} color={sort !== "behind" ? "#fff" : palette.text} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable accessibilityLabel="Close sort options" style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={styles.sheetTitle}>SORT BY</Text>
            {SORTS.map((s) => {
              const on = s.key === sort;
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={s.label}
                  onPress={() => {
                    onSort(s.key);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: palette.raised }]}
                >
                  <Text style={[styles.optionText, on && styles.optionOn]}>{s.label}</Text>
                  {on ? <Ionicons name="checkmark" size={20} color={palette.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginBottom: 14 },
  bar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  focused: { borderColor: palette.primary },
  input: { flex: 1, color: palette.text, fontSize: 15.5, paddingVertical: 0, height: "100%" },
  sort: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  sortActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: palette.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingBottom: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  sheetTitle: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4, paddingHorizontal: 22, marginBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 22 },
  optionText: { color: "#D7D7DA", fontSize: 16, fontWeight: "600" },
  optionOn: { color: palette.text, fontWeight: "800" },
});
