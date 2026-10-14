import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { registerForPush } from "@/push/register";
import { Loading } from "@/components/ui";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function Routes() {
  const { state } = useAuth();
  const signedIn = state.status === "signedIn";

  useEffect(() => {
    if (signedIn) registerForPush().catch((e) => console.warn("Push registration failed", e));
  }, [signedIn]);

  if (state.status === "loading") return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
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

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Routes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
