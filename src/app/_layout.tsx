import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { SHELL_ONLY } from "@/config";
import { AlertsEffects } from "@/alerts";
import { Loading } from "@/components/ui";
import { SplashOverlay } from "@/components/SplashOverlay";

// Keep the native splash up until the splash artwork (SplashOverlay) has loaded and taken over.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

function Routes({ ready }: { ready: boolean }) {
  const { state } = useAuth();
  const signedIn = state.status === "signedIn";
  const unreachable = state.status === "unreachable";

  if (!ready) return <Loading />;
  return (
    <>
      {signedIn ? <AlertsEffects /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="manga/[id]" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="stats" />
          <Stack.Screen name="alert-history" />
          <Stack.Screen name="mood" />
        </Stack.Protected>
        <Stack.Protected guard={unreachable}>
          <Stack.Screen name="offline" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn && !unreachable}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

// The routes render underneath the splash artwork while the session is restored, so the first real
// screen is already in place when the artwork fades out.
function FullApp() {
  const { state } = useAuth();
  const ready = state.status !== "loading";
  return (
    <View style={{ flex: 1 }}>
      <Routes ready={ready} />
      <SplashOverlay appReady={ready} />
    </View>
  );
}

function Shell() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <SplashOverlay appReady />
    </View>
  );
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
        <FullApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
