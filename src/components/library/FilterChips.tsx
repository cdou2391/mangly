import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { FILTERS, type LibraryFilter } from "@/utils/library";
import { palette } from "@/theme";

export function FilterChips({
  value,
  counts,
  onChange,
  unreadOnly,
  unreadCount,
  onToggleUnread,
}: {
  value: LibraryFilter;
  counts: Record<LibraryFilter, number>;
  onChange: (f: LibraryFilter) => void;
  /** "Unread" is a second filter, on top of the status: titles with chapters you have not read. */
  unreadOnly: boolean;
  unreadCount: number;
  onToggleUnread: () => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={{ flexGrow: 0, marginBottom: 14 }}
    >
      {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0 || f.key === value).map((f) => {
        const on = value === f.key;
        return (
          <Pressable
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${f.label}, ${counts[f.key]}`}
            onPress={() => onChange(f.key)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{f.label}</Text>
            <Text style={[styles.count, on && styles.countOn]}>{counts[f.key]}</Text>
          </Pressable>
        );
      })}
      {unreadCount > 0 || unreadOnly ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: unreadOnly }}
          accessibilityLabel={`Unread only, ${unreadCount}`}
          onPress={onToggleUnread}
          style={[styles.chip, styles.unread, unreadOnly && styles.chipOn]}
        >
          <Text style={[styles.label, unreadOnly && styles.labelOn]}>Unread</Text>
          <Text style={[styles.count, unreadOnly && styles.countOn]}>{unreadCount}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  unread: { marginLeft: 6 },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  label: { color: "#C8C8CC", fontSize: 13, fontWeight: "700" },
  labelOn: { color: "#fff" },
  count: { color: palette.faint, fontSize: 13, fontWeight: "700" },
  countOn: { color: "rgba(255,255,255,0.8)" },
});
