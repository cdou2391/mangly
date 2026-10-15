import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** One line in a settings list: an icon, a label, and either a value (plain) or an arrow (when it opens something). */
export function SettingsRow({
  icon,
  label,
  value,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const inner = (
    <>
      <View style={styles.icon}>
        <Ionicons name={icon} size={18} color={palette.text} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress ? <Ionicons name="open-outline" size={17} color={palette.faint} /> : null}
    </>
  );
  const style = [styles.row, !last && styles.divider];
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={value ? `${label}, ${value}` : label} style={style}>
        {inner}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [style, pressed && { backgroundColor: palette.raised }]}>
      {inner}
    </Pressable>
  );
}

/** A titled group of rows in one rounded card. */
export function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 2.4, marginBottom: 10 },
  card: { borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 56, paddingHorizontal: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: palette.raised },
  label: { flex: 1, color: palette.text, fontSize: 15.5, fontWeight: "600" },
  value: { color: palette.muted, fontSize: 14.5 },
});
