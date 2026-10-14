import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { auth } from "./authTheme";

type Props = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Icon shown before the label (secondary) or after it (primary: an arrow). */
  icon?: ComponentProps<typeof Ionicons>["name"];
  variant?: "primary" | "secondary";
};

export function AuthButton({ title, onPress, loading, disabled, icon, variant = "primary" }: Props) {
  const primary = variant === "primary";
  const inert = disabled || loading;

  const label = (
    <View style={styles.row}>
      {!primary && icon ? <Ionicons name={icon} size={22} color={auth.text} style={styles.lead} /> : null}
      {loading ? (
        <ActivityIndicator color={auth.text} />
      ) : (
        <Text style={[styles.label, primary ? styles.primaryLabel : styles.secondaryLabel]}>{title}</Text>
      )}
      {primary && icon && !loading ? (
        <Ionicons name={icon} size={24} color={auth.text} style={styles.trail} />
      ) : null}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [styles.base, !primary && styles.secondary, { opacity: pressed || disabled ? 0.8 : 1 }]}
    >
      {primary ? (
        <LinearGradient
          colors={["#FF3030", "#D1001A", "#A10010"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.fill}
        >
          {label}
        </LinearGradient>
      ) : (
        label
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: auth.buttonHeight, borderRadius: auth.radius, overflow: "hidden" },
  secondary: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(6,6,6,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  lead: { marginRight: 12 },
  trail: { position: "absolute", right: 22 },
  label: { color: auth.text },
  primaryLabel: { fontSize: 19, fontWeight: "700" },
  secondaryLabel: { fontSize: 17, fontWeight: "600" },
});
