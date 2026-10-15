import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette } from "@/theme";

/** Large screen title with an optional subtitle and a trailing control (e.g. the bell). */
export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 },
  text: { flex: 1, paddingRight: 12 },
  title: { color: palette.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 13, marginTop: 3 },
});
