import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { HomeEmpty } from "@/components/HomeEmpty";
import { SHELL_ONLY } from "@/config";

function AuthRedirect() {
  const { state } = useAuth();
  return <Redirect href={state.status === "signedIn" ? "/library" : "/login"} />;
}

// In shell mode there is no AuthProvider, so the redirect component must not be rendered at all.
export default function Index() {
  return SHELL_ONLY ? <HomeEmpty /> : <AuthRedirect />;
}
