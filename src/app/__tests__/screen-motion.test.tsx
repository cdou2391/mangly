import { render } from "@testing-library/react-native";
import RootLayout from "../_layout";
import TabsLayout from "../(tabs)/_layout";

// The motion between screens is set in the two layouts; these tests read what each screen is told to do.
const screens: Record<string, { animation?: string }> = {};
let tabsOptions: Record<string, unknown> = {};

jest.mock("expo-router", () => {
  const Stack = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  Stack.Screen = ({ name, options }: { name: string; options?: { animation?: string } }) => {
    screens[name] = options ?? {};
    return null;
  };
  Stack.Protected = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Tabs = ({ screenOptions, children }: { screenOptions: Record<string, unknown>; children?: React.ReactNode }) => {
    tabsOptions = screenOptions;
    return <>{children}</>;
  };
  Tabs.Screen = () => null;
  return { Stack, Tabs };
});
jest.mock("@/auth/AuthContext", () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useAuth: () => ({ state: { status: "signedIn" } }) }));
jest.mock("@/alerts", () => ({ AlertsEffects: () => null }));
jest.mock("@/components/SplashOverlay", () => ({ SplashOverlay: () => null }));
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(async () => true), hideAsync: jest.fn(async () => {}) }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/hooks/useUpdatesFeed", () => ({ useUpdatesFeed: () => ({ unreadCount: 0 }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

describe("between screens", () => {
  it("opens a title by rising up, and the screens opened from within the app by sliding in", async () => {
    await render(<RootLayout />);
    expect(screens["manga/[id]"].animation).toBe("fade_from_bottom");
    for (const name of ["change-password", "stats", "alert-history", "mood"]) expect(screens[name].animation).toBe("slide_from_right");
  });

  it("cross-fades between the app, the sign-in screens and the can't-reach screen", async () => {
    await render(<RootLayout />);
    for (const name of ["(tabs)", "offline", "(auth)"]) expect(screens[name].animation).toBe("fade");
  });

  it("shifts and fades when switching tabs", async () => {
    await render(<TabsLayout />);
    expect(tabsOptions.animation).toBe("shift");
  });
});
