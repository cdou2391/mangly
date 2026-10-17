import { StyleSheet, Text, View } from "react-native";
import { palette } from "@/theme";

/** A big number with a caption, for the figures at the top. */
export function StatTile({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}${note ? `, ${note}` : ""}`} style={styles.tile}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/** One horizontal bar: a label, a bar filled to `fraction` (0 to 1) and the count. */
export function BarRow({ label, count, fraction, color = palette.primary }: { label: string; count: number; fraction: number; color?: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${count}`} style={styles.barRow}>
      <Text numberOfLines={1} style={styles.barLabel}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(count > 0 ? 3 : 0, Math.round(fraction * 100))}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barCount}>{count}</Text>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text accessibilityRole="header" style={styles.section}>
        {title}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: "48.5%", padding: 16, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  value: { color: palette.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  label: { color: palette.muted, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  note: { color: palette.faint, fontSize: 11.5, marginTop: 4 },
  section: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4, marginBottom: 10 },
  card: { padding: 16, gap: 12, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  barLabel: { width: 96, color: "#D7D7DA", fontSize: 13.5, fontWeight: "600" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#262626", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  barCount: { width: 34, textAlign: "right", color: palette.text, fontSize: 13.5, fontWeight: "800" },
});
