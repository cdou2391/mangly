import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, useTheme } from "@/theme";

export function Screen({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top, padding: padded ? spacing.lg : 0 }}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  variant = "primary",
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.primary : variant === "danger" ? t.danger : "transparent";
  const fg = variant === "ghost" ? t.text : t.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: variant === "ghost" ? t.border : bg, opacity: pressed || disabled ? 0.7 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string }) {
  const t = useTheme();
  const { label, error, style, ...rest } = props;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...rest}
        style={[s.input, { color: t.text, backgroundColor: t.card, borderColor: error ? t.danger : t.border }, style]}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={s.empty}>
      <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{title}</Text>
      {hint ? <Text style={{ color: t.muted, textAlign: "center" }}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={s.empty}>
      <Text style={{ color: t.danger, textAlign: "center" }}>{message}</Text>
      {onRetry ? <Button title="Retry" variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={s.empty}>
      <ActivityIndicator color={t.primary} />
    </View>
  );
}

const s = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  buttonText: { fontSize: 16, fontWeight: "600" },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
});
