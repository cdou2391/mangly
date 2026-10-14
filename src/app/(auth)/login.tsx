import { useState } from "react";
import { Text, View } from "react-native";
import { Link } from "expo-router";
import { z } from "zod";
import { useAuth } from "@/auth/AuthContext";
import { Button, Field, Screen } from "@/components/ui";
import { spacing, useTheme } from "@/theme";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export default function Login() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.lg }}>
        <Text style={{ color: t.text, fontSize: 32, fontWeight: "800" }}>Mangly</Text>
        <Text style={{ color: t.muted }}>Sign in with your MangaPulse account.</Text>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" error={errors.email} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" error={errors.password} />
        {formError ? <Text style={{ color: t.danger }}>{formError}</Text> : null}
        <Button title="Sign in" onPress={submit} loading={busy} />
        <Link href="/register" style={{ color: t.primary, textAlign: "center" }}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}
