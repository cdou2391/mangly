import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { SHELL_ONLY } from "@/config";
import { registerForPush } from "@/push/register";
import { Loading } from "@/components/ui";

// Keep the native splash up until the first real screen is ready to draw.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function Routes() {
  const { state } = useAuth();
  const signedIn = state.status === "signedIn";
  const ready = state.status !== "loading";

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (signedIn) registerForPush().catch((e) => console.warn("Push registration failed", e));
  }, [signedIn]);

  if (!ready) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="manga/[id]" options={{ headerShown: true, title: "" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function Shell() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  if (SHELL_ONLY) {
    return (
      <>
        <StatusBar style="auto" />
        <Shell />
      </>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Routes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
