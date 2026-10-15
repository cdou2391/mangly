import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { HomeEmpty } from "@/components/HomeEmpty";
import { SHELL_ONLY } from "@/config";

function AuthRedirect() {
  const { state } = useAuth();
  const href = state.status === "signedIn" ? "/library" : state.status === "unreachable" ? "/offline" : "/login";
  return <Redirect href={href} />;
}

// In shell mode there is no AuthProvider, so the redirect component must not be rendered at all.
export default function Index() {
  return SHELL_ONLY ? <HomeEmpty /> : <AuthRedirect />;
}
