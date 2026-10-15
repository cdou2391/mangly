import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import Settings from "@/app/(tabs)/settings";
import { useAuth } from "@/auth/AuthContext";
import { trackingApi } from "@/api/endpoints";
import { setOnline } from "@/api/reachability";
import type { ReadingStatus, TrackedManga, User } from "@/api/types";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn() } }));
jest.mock("@/auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/config", () => ({ WEB_URL: "https://web.test" }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.3" } } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

const user = (over: Partial<User> = {}): User => ({
  id: 1, full_name: "Ada Lovelace", email: "ada@example.com", role: "user", is_active: true,
  created_at: new Date(2026, 9, 14, 12).toISOString(), updated_at: "", features: [], ...over,
});
const tracked = (n: number, status: ReadingStatus) => ({ id: n, reading_status: status }) as TrackedManga;

let signOut: jest.Mock;
function signedIn(u: User = user()) {
  signOut = jest.fn(async () => {});
  mockedUseAuth.mockReturnValue({ state: { status: "signedIn", user: u }, signOut });
}

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderSettings = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } })}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Settings />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  setOnline(true);
  signedIn();
  list.mockResolvedValue([tracked(1, "reading"), tracked(2, "reading"), tracked(3, "completed"), tracked(4, "plan_to_read")]);
});

describe("the profile", () => {
  it("shows who is signed in, with initials and since when", async () => {
    await renderSettings();
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
    expect(screen.getByText("AL")).toBeTruthy();
    expect(screen.getByText("Member since Oct 2026")).toBeTruthy();
    expect(screen.queryByText("ADMIN")).toBeNull();
  });

  it("marks an administrator", async () => {
    signedIn(user({ role: "admin" }));
    await renderSettings();
    expect(await screen.findByText("ADMIN")).toBeTruthy();
  });

  it("renders nothing while signed out", async () => {
    mockedUseAuth.mockReturnValue({ state: { status: "signedOut" }, signOut: jest.fn() });
    await renderSettings();
    expect(screen.queryByText("Settings")).toBeNull();
  });
});

describe("the library numbers", () => {
  it("count the library by status, and only show the small ones that have something in them", async () => {
    await renderSettings();
    expect(await screen.findByLabelText("4 Tracked")).toBeTruthy();
    expect(screen.getByLabelText("2 Reading")).toBeTruthy();
    expect(screen.getByLabelText("1 Completed")).toBeTruthy();
    expect(screen.getByLabelText("1 Plan to read")).toBeTruthy();
    expect(screen.queryByLabelText(/On hold/)).toBeNull();
    expect(screen.queryByLabelText(/Dropped/)).toBeNull();
  });

  it("show zeros for an empty library", async () => {
    list.mockResolvedValue([]);
    await renderSettings();
    expect(await screen.findByLabelText("0 Tracked")).toBeTruthy();
    expect(screen.getByLabelText("0 Reading")).toBeTruthy();
  });

  it("show a placeholder while loading, then retry after a failure", async () => {
    list.mockRejectedValueOnce(new Error("Network error."));
    await renderSettings();
    expect(await screen.findByText(/Couldn't load your library numbers/)).toBeTruthy();
    list.mockResolvedValueOnce([tracked(1, "reading")]);
    await fireEvent.press(screen.getByRole("button", { name: /Couldn't load/ }));
    expect(await screen.findByLabelText("1 Tracked")).toBeTruthy();
  });
});

describe("help and about", () => {
  it("opens the web app and the password reset page", async () => {
    await renderSettings();
    await fireEvent.press(await screen.findByRole("link", { name: "MangaPulse on the web" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://web.test");
    await fireEvent.press(screen.getByRole("link", { name: "Reset password" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://web.test/forgot-password");
  });

  it("shows the app version", async () => {
    await renderSettings();
    expect(await screen.findByLabelText("Version, 1.2.3")).toBeTruthy();
  });
});

describe("the connection", () => {
  it("says Online when the server is reachable", async () => {
    await renderSettings();
    expect(await screen.findByLabelText("Connection, Online")).toBeTruthy();
  });

  it("says Offline when it is not, and goes back to Online by itself", async () => {
    setOnline(false);
    await renderSettings();
    expect(await screen.findByLabelText("Connection, Offline")).toBeTruthy();
    expect(screen.queryByLabelText("Connection, Online")).toBeNull();
    await act(async () => setOnline(true));
    expect(screen.getByLabelText("Connection, Online")).toBeTruthy();
  });

  it("still shows the library numbers from the saved copy while offline", async () => {
    setOnline(false);
    list.mockRejectedValue(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["tracked"], [tracked(1, "reading"), tracked(2, "completed")]);
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={metrics}>
          <Settings />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByLabelText("Connection, Offline")).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalled()); // the refresh was tried and failed
    expect(await screen.findByLabelText("2 Tracked")).toBeTruthy();
    expect(screen.getByLabelText("1 Reading")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load your library numbers/)).toBeNull();
  });
});

describe("signing out", () => {
  beforeEach(() => jest.spyOn(Alert, "alert").mockImplementation(() => {}));
  afterEach(() => (Alert.alert as jest.Mock).mockRestore());

  const answer = async (label: string) => {
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === label)!.onPress?.());
  };

  it("asks first, and does nothing if cancelled", async () => {
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    expect(Alert.alert).toHaveBeenCalledWith("Sign out?", expect.stringContaining("push notifications"), expect.any(Array));
    await answer("Cancel");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out once confirmed, and shows it is busy meanwhile", async () => {
    let finish!: () => void;
    signOut.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    await answer("Sign out");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sign out" }).props.accessibilityState.busy).toBe(true);
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Sign out" }).props.accessibilityState.busy).toBe(false);
  });
});
