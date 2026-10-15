import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/theme";

export type FeedFilterKey = "all" | "new";

/** The All / New switch at the top of Updates. */
export function FeedFilter({
  value,
  counts,
  onChange,
}: {
  value: FeedFilterKey;
  counts: Record<FeedFilterKey, number>;
  onChange: (f: FeedFilterKey) => void;
}) {
  return (
    <View style={styles.row}>
      {(["all", "new"] as const).map((key) => {
        const on = value === key;
        const label = key === "all" ? "All" : "New";
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${counts[key]}`}
            onPress={() => onChange(key)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
            <Text style={[styles.count, on && styles.countOn]}>{counts[key]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  label: { color: "#C8C8CC", fontSize: 13, fontWeight: "700" },
  labelOn: { color: "#fff" },
  count: { color: palette.faint, fontSize: 13, fontWeight: "700" },
  countOn: { color: "rgba(255,255,255,0.8)" },
});
