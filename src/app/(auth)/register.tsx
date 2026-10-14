import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { z } from "zod";
import { authApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFooter, OrDivider } from "@/components/auth/AuthFooter";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BrandHeader } from "@/components/auth/BrandHeader";
import { auth } from "@/components/auth/authTheme";

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
  const { signIn } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a ref, not state: state can be stale if two submits land before a re-render
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (inFlight.current) return;
    setFormError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    inFlight.current = true;
    setBusy(true);
    try {
      await authApi.register(parsed.data);
      await signIn(parsed.data.email, parsed.data.password);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <View style={{ flex: 1, justifyContent: "center", minHeight: 200, paddingVertical: 8 }}>
        <BrandHeader compact />
      </View>

      <View style={{ gap: 14 }}>
        <AuthField
          icon="person-outline"
          label="Name"
          placeholder="Name"
          value={form.full_name}
          onChangeText={set("full_name")}
          error={errors.full_name}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <AuthField
          ref={emailRef}
          icon="mail-outline"
          label="Email"
          placeholder="Email"
          value={form.email}
          onChangeText={set("email")}
          error={errors.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <AuthField
          ref={passwordRef}
          icon="lock-closed-outline"
          label="Password"
          placeholder="Password"
          hint="At least 8 characters, with a letter and a number."
          value={form.password}
          onChangeText={set("password")}
          error={errors.password}
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
        <Text accessibilityLiveRegion="polite" style={{ color: auth.error, marginTop: 14, textAlign: "center" }}>
          {formError}
        </Text>
      ) : null}

      <View style={{ marginTop: 22 }}>
        <AuthButton title="Create account" icon="arrow-forward" onPress={submit} loading={busy} />
      </View>

      <OrDivider />
      <AuthButton variant="secondary" title="I already have an account" icon="log-in-outline" onPress={() => router.replace("/login")} />
      <AuthFooter />
    </AuthScreen>
  );
}
