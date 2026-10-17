import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { z } from "zod";
import { useAuth } from "@/auth/AuthContext";
import { WEB_URL } from "@/config";
import { openInBrowser } from "@/utils/browser";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFooter, OrDivider } from "@/components/auth/AuthFooter";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BrandHeader } from "@/components/auth/BrandHeader";
import { auth } from "@/components/auth/authTheme";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export default function Login() {
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false); // a ref, not state: state can be stale if two submits land before a re-render

  async function submit() {
    if (inFlight.current) return;
    setFormError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    inFlight.current = true;
    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthScreen header={<BrandHeader />} footer={<AuthFooter />}>
      <View style={{ gap: 14 }}>
        <AuthField
          icon="mail-outline"
          label="Email"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
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
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>

      <Pressable
        accessibilityRole="link"
        hitSlop={10}
        onPress={() => openInBrowser(`${WEB_URL}/forgot-password`)}
        style={{ alignSelf: "flex-end", marginTop: 12 }}
      >
        <Text style={{ color: auth.red, fontSize: 15, fontWeight: "600" }}>Forgot password?</Text>
      </Pressable>

      {formError ? (
        <Text accessibilityLiveRegion="polite" style={{ color: auth.error, marginTop: 14, textAlign: "center" }}>
          {formError}
        </Text>
      ) : null}

      <View style={{ marginTop: 20 }}>
        <AuthButton title="Log In" icon="arrow-forward" onPress={submit} loading={busy} />
      </View>

      <OrDivider />
      <AuthButton variant="secondary" title="Create account" icon="person-outline" onPress={() => router.push("/register")} />
    </AuthScreen>
  );
}
