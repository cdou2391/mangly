import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { authApi } from "@/api/endpoints";
import { describeError } from "@/api/errors";
import { useAuth } from "@/auth/AuthContext";
import { validateRegistration } from "@/auth/registration";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthField } from "@/components/auth/AuthField";
import { AuthFooter, OrDivider } from "@/components/auth/AuthFooter";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { BrandHeader } from "@/components/auth/BrandHeader";
import { auth } from "@/components/auth/authTheme";

export default function Register() {
  const { signIn } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = useRef<{ email: string; password: string } | null>(null); // the account made by this screen, if any
  const inFlight = useRef(false); // a ref, not state: state can be stale if two submits land before a re-render
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (inFlight.current) return;
    setFormError(null);
    const checked = validateRegistration(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    const { data } = checked;
    setErrors({});
    inFlight.current = true;
    setBusy(true);
    let accountExists = false; // set once this attempt knows the account is there, so a later failure is about signing in
    try {
      // If the account was created but signing in failed, a second tap only signs in: registering again would be refused
      // as a duplicate of the account that was just made.
      accountExists = created.current?.email === data.email.toLowerCase() && created.current.password === data.password;
      if (!accountExists) {
        await authApi.register(data);
        created.current = { email: data.email.toLowerCase(), password: data.password };
        accountExists = true;
      }
      await signIn(data.email, data.password);
    } catch (e) {
      const why = describeError(e, "register");
      setFormError(accountExists ? `Your account is ready, but we couldn't sign you in. ${why} Tap Create account to try again, or log in.` : why);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthScreen header={<BrandHeader compact />} footer={<AuthFooter />}>
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
    </AuthScreen>
  );
}
