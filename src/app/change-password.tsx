import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ApiError } from "@/api/client";
import { describeError } from "@/api/errors";
import { useAuth } from "@/auth/AuthContext";
import { passwordProblem } from "@/auth/registration";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthField } from "@/components/auth/AuthField";
import { BackBar } from "@/components/detail/BackBar";
import { Screen } from "@/components/ui";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { palette } from "@/theme";

type Errors = Partial<Record<"current" | "next" | "confirm", string>>;

/** Change the password from inside the app. The server signs every other device out; this one stays signed in. */
export default function ChangePassword() {
  const { changePassword } = useAuth();
  const keyboard = useKeyboardHeight();
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false); // a ref, not state: state can be stale if two submits land before a re-render
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function check(): Errors {
    const found: Errors = {};
    if (!form.current) found.current = "Enter your current password.";
    const problem = passwordProblem(form.next);
    if (problem) found.next = problem;
    else if (form.next === form.current) found.next = "Choose a password different from the current one.";
    if (form.confirm !== form.next) found.confirm = "The passwords don't match.";
    return found;
  }

  async function submit() {
    if (inFlight.current) return;
    setFormError(null);
    const found = check();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (await changePassword(form.current, form.next)) setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setErrors({ current: e.message });
      else setFormError(describeError(e, "password"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <BackBar />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: 40 + keyboard }]}>
        <Text accessibilityRole="header" style={styles.title}>
          Change password
        </Text>
        {done ? (
          <View accessibilityLiveRegion="polite" style={styles.done}>
            <Ionicons name="checkmark-circle" size={44} color={palette.success} />
            <Text style={styles.doneTitle}>Password changed</Text>
            <Text style={styles.doneHint}>You're still signed in here. Every other device has been signed out, so it will ask for the new password.</Text>
            <View style={{ alignSelf: "stretch", marginTop: 8 }}>
              <AuthButton title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))} />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.lead}>Other devices signed in to your account will be signed out.</Text>
            <View style={{ gap: 14 }}>
              <AuthField
                icon="lock-open-outline"
                label="Current password"
                placeholder="Current password"
                value={form.current}
                onChangeText={set("current")}
                error={errors.current}
                revealable
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="next"
                onSubmitEditing={() => nextRef.current?.focus()}
              />
              <AuthField
                ref={nextRef}
                icon="lock-closed-outline"
                label="New password"
                placeholder="New password"
                hint="At least 8 characters, with a letter and a number."
                value={form.next}
                onChangeText={set("next")}
                error={errors.next}
                revealable
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
              />
              <AuthField
                ref={confirmRef}
                icon="lock-closed-outline"
                label="Confirm new password"
                placeholder="Confirm new password"
                value={form.confirm}
                onChangeText={set("confirm")}
                error={errors.confirm}
                revealable
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>
            {formError ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {formError}
              </Text>
            ) : null}
            <View style={{ marginTop: 22 }}>
              <AuthButton title="Change password" icon="arrow-forward" onPress={submit} loading={busy} />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10 },
  title: { color: palette.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  lead: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 8, marginBottom: 22 },
  error: { color: palette.danger, marginTop: 14, textAlign: "center", lineHeight: 20 },
  done: { alignItems: "center", gap: 10, paddingTop: 36 },
  doneTitle: { color: palette.text, fontSize: 20, fontWeight: "800" },
  doneHint: { color: palette.muted, textAlign: "center", lineHeight: 21 },
});
