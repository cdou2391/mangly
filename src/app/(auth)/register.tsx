import { useState } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import { z } from "zod";
import { authApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { Button, Field, Screen } from "@/components/ui";
import { spacing, useTheme } from "@/theme";

// Mirrors the backend rules: min length, at least one letter and one digit, max 72 bytes (bcrypt).
const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(255),
  email: z.string().trim().email("Enter a valid email."),
  password: z
    .string()
    .min(8, "At least 8 characters.")
    .max(72, "At most 72 characters.")
    .regex(/[A-Za-z]/, "Include a letter.")
    .regex(/\d/, "Include a number."),
});

export default function Register() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setFormError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await authApi.register(parsed.data);
      await signIn(parsed.data.email, parsed.data.password);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg }}>
        <Text style={{ color: t.text, fontSize: 28, fontWeight: "800" }}>Create account</Text>
        <Field label="Name" value={form.full_name} onChangeText={set("full_name")} autoComplete="name" error={errors.full_name} />
        <Field label="Email" value={form.email} onChangeText={set("email")} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={errors.email} />
        <Field label="Password" value={form.password} onChangeText={set("password")} secureTextEntry autoComplete="new-password" error={errors.password} />
        {formError ? <Text style={{ color: t.danger }}>{formError}</Text> : null}
        <Button title="Create account" onPress={submit} loading={busy} />
        <Link href="/login" style={{ color: t.primary, textAlign: "center" }}>
          I already have an account
        </Link>
      </View>
    </Screen>
  );
}
