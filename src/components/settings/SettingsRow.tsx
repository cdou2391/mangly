import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
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
  warn,
  action,
  busy,
  navigates,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  /** The row does something in the app (shares a file) rather than opening a web page: drawn with a share arrow, announced as a button. */
  action?: boolean;
  /** The action is running: shows a spinner and ignores taps. */
  busy?: boolean;
  /** The row opens another screen of the app: drawn with a forward arrow instead of the "opens a web page" icon. */
  navigates?: boolean;
  /** Draw the value (and icon) in the alert colour, for a state that needs attention. */
  warn?: boolean;
}) {
  const inner = (
    <>
      <View style={styles.icon}>
        <Ionicons name={icon} size={18} color={warn ? palette.danger : palette.text} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {value ? <Text style={[styles.value, warn && { color: palette.danger, fontWeight: "700" }]}>{value}</Text> : null}
      {busy ? <ActivityIndicator size="small" color={palette.muted} /> : onPress ? <Ionicons name={action ? "share-outline" : navigates ? "chevron-forward" : "open-outline"} size={17} color={palette.faint} /> : null}
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
    <Pressable
      accessibilityRole={action || navigates ? "button" : "link"}
      accessibilityLabel={label}
      accessibilityState={action ? { busy: !!busy, disabled: !!busy } : undefined}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && { backgroundColor: palette.raised }]}>
      {inner}
    </Pressable>
  );
}

/** A row with an on/off switch. `value` null means the saved choice has not been read yet; the switch is disabled until then. */
export function SettingsSwitchRow({
  icon,
  label,
  hint,
  value,
  busy,
  onChange,
  last,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  value: boolean | null;
  busy?: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.divider, { paddingVertical: 10 }]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={18} color={palette.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value === true}
        disabled={value === null || busy}
        onValueChange={onChange}
        trackColor={{ false: "#2A2A2E", true: palette.primaryDeep }}
        thumbColor={value ? palette.primary : "#8E8E93"}
      />
    </View>
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
  hint: { color: palette.faint, fontSize: 12.5, marginTop: 2 },
});
