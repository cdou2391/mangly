import { View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { SHELL_ONLY } from "@/config";
import { AlertsEffects } from "@/alerts";
import { Loading } from "@/components/ui";
import { SplashOverlay } from "@/components/SplashOverlay";
import { palette } from "@/theme";

// Keep the native splash up until the splash artwork (SplashOverlay) has loaded and taken over.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

// The navigator paints a background behind every screen, and while screens fade or slide it shows through. Its default is white,
// which showed as a flash between screens, so the app's own dark background is set everywhere it can appear.
const navigationTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: palette.bg, card: palette.bg, border: palette.border } };

function Routes({ ready }: { ready: boolean }) {
  const { state } = useAuth();
  const signedIn = state.status === "signedIn";
  const unreachable = state.status === "unreachable";

  if (!ready) return <Loading />;
  return (
    <>
      {signedIn ? <AlertsEffects /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={signedIn}>
          {/* Moving between the app, the sign-in screens and the "can't reach" screen cross-fades; screens opened from within the app slide in. */}
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          {/* A title opens by rising into place, and its content settles in behind it (see the page itself). */}
          <Stack.Screen name="manga/[id]" options={{ animation: "fade_from_bottom" }} />
          <Stack.Screen name="change-password" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="stats" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="alert-history" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="mood" options={{ animation: "slide_from_right" }} />
        </Stack.Protected>
        <Stack.Protected guard={unreachable}>
          <Stack.Screen name="offline" options={{ animation: "fade" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn && !unreachable}>
          <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
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
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Routes ready={ready} />
      <SplashOverlay appReady={ready} />
    </View>
  );
}

function Shell() {
  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }} />
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
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="auto" />
          <FullApp />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
