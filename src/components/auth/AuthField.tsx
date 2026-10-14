import { forwardRef, useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthLayout } from "./AuthScreen";
import { auth } from "./authTheme";

type Props = TextInputProps & {
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Spoken label; the design has no visible one, so the placeholder alone is not enough. */
  label: string;
  error?: string;
  /** Guidance shown under the field while there is no error. */
  hint?: string;
  /** Adds a show/hide toggle (for passwords). */
  revealable?: boolean;
};

export const AuthField = forwardRef<TextInput, Props>(function AuthField(
  { icon, label, error, hint, revealable, secureTextEntry, onFocus, onBlur, ...rest },
  ref,
) {
  const { ensureFocusedVisible } = useAuthLayout();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const hidden = revealable ? !shown : secureTextEntry;
  const border = error ? auth.error : focused ? auth.fieldBorderFocus : auth.fieldBorder;

  return (
    <View>
      <View style={[styles.box, { borderColor: border }]}>
        <Ionicons name={icon} size={22} color="#E8E8EA" style={styles.icon} />
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor="#7C7C82"
          selectionColor={auth.red}
          secureTextEntry={hidden}
          style={styles.input}
          onFocus={(e) => {
            setFocused(true);
            ensureFocusedVisible();
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {revealable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? "Hide password" : "Show password"}
            hitSlop={12}
            onPress={() => setShown((s) => !s)}
            style={styles.eye}
          >
            <Ionicons name={shown ? "eye-outline" : "eye-off-outline"} size={22} color="#A6A6AB" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    height: auth.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: auth.radius,
    borderWidth: 1,
    backgroundColor: auth.fieldBg,
  },
  icon: { marginLeft: 18, marginRight: 14 },
  input: { flex: 1, color: auth.text, fontSize: 16, height: "100%", paddingRight: 8 },
  eye: { paddingHorizontal: 18, height: "100%", justifyContent: "center" },
  error: { color: auth.error, fontSize: 12.5, marginTop: 6, marginLeft: 6 },
  hint: { color: auth.muted, fontSize: 12.5, marginTop: 6, marginLeft: 6 },
});
