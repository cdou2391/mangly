import { render } from "@testing-library/react-native";
import { palette } from "@/theme";
import RootLayout from "../_layout";
import TabsLayout from "../(tabs)/_layout";

// The motion between screens is set in the two layouts; these tests read what each screen is told to do.
const screens: Record<string, { animation?: string }> = {};
let tabsOptions: Record<string, unknown> = {};
let stackOptions: Record<string, unknown> = {};
let theme: { colors: Record<string, string> } | undefined;

jest.mock("expo-router", () => {
  const Stack = ({ screenOptions, children }: { screenOptions?: Record<string, unknown>; children?: React.ReactNode }) => {
    stackOptions = screenOptions ?? {};
    return <>{children}</>;
  };
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
  const ThemeProvider = ({ value, children }: { value: { colors: Record<string, string> }; children?: React.ReactNode }) => {
    theme = value;
    return <>{children}</>;
  };
  return { Stack, Tabs, ThemeProvider, DarkTheme: { dark: true, colors: { background: "#000", card: "#111", border: "#222", text: "#fff" } } };
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

  it("paints the app's own dark background behind every screen, so nothing flashes white while screens fade or slide", async () => {
    await render(<RootLayout />);
    expect(theme?.colors.background).toBe(palette.bg);
    expect(theme?.colors.card).toBe(palette.bg);
    expect(stackOptions.contentStyle).toEqual({ backgroundColor: palette.bg });
    await render(<TabsLayout />);
    expect(tabsOptions.sceneStyle).toEqual({ backgroundColor: palette.bg });
  });
});
