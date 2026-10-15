import { StyleSheet, Text, View } from "react-native";
import type { LibraryFilter } from "@/utils/library";
import { palette } from "@/theme";

const BIG: { key: LibraryFilter; label: string }[] = [
  { key: "all", label: "Tracked" },
  { key: "reading", label: "Reading" },
  { key: "completed", label: "Completed" },
];
const SMALL: { key: LibraryFilter; label: string }[] = [
  { key: "plan_to_read", label: "Plan to read" },
  { key: "on_hold", label: "On hold" },
  { key: "dropped", label: "Dropped" },
];

/** Library numbers at a glance. The three headline counts always show; the others only when there is something in them. */
export function LibraryStats({ counts }: { counts: Record<LibraryFilter, number> | null }) {
  const small = counts ? SMALL.filter((s) => counts[s.key] > 0) : [];
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        {BIG.map((b) => (
          <View key={b.key} accessible accessibilityLabel={counts ? `${counts[b.key]} ${b.label}` : `${b.label}, loading`} style={styles.tile}>
            <Text style={styles.value}>{counts ? counts[b.key] : "–"}</Text>
            <Text style={styles.label}>{b.label}</Text>
          </View>
        ))}
      </View>
      {small.length > 0 ? (
        <View style={styles.smallRow}>
          {small.map((s) => (
            <View key={s.key} accessible accessibilityLabel={`${counts![s.key]} ${s.label}`} style={styles.pill}>
              <Text style={styles.pillValue}>{counts![s.key]}</Text>
              <Text style={styles.pillLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, paddingVertical: 16, paddingHorizontal: 12, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  value: { color: palette.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  label: { color: palette.muted, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  smallRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 7, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  pillValue: { color: palette.primary, fontSize: 13.5, fontWeight: "800" },
  pillLabel: { color: "#C8C8CC", fontSize: 13, fontWeight: "600" },
});
