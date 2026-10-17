import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { BROWSER_OPTIONS } from "@/utils/browser";
import Settings from "@/app/(tabs)/settings";
import { Linking } from "react-native";
import { sendTestNotification, useAlertSetting, useAlertStatus } from "@/alerts";
import { EMPTY, type AlertsState } from "@/alerts/state";
import { useAuth } from "@/auth/AuthContext";
import { trackingApi } from "@/api/endpoints";
import { setOnline } from "@/api/reachability";
import { shareLibrary } from "@/export/shareLibrary";
import type { ReadingStatus, TrackedManga, User } from "@/api/types";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn() } }));
jest.mock("@/alerts", () => ({ useAlertSetting: jest.fn(), useAlertStatus: jest.fn(), sendTestNotification: jest.fn() }));
jest.mock("@/auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/config", () => ({ WEB_URL: "https://web.test" }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    require("react").useEffect(callback, [callback]);
  },
}));
jest.mock("@/export/shareLibrary", () => ({ shareLibrary: jest.fn(async () => {}) }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.3" } } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

const list = trackingApi.list as jest.Mock;
const share = shareLibrary as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;
const mockedAlerts = useAlertSetting as jest.Mock;
const mockedStatus = useAlertStatus as jest.Mock;
const sendTest = sendTestNotification as jest.Mock;
let setAlerts: jest.Mock;
let refreshStatus: jest.Mock;
const withStatus = (over: Partial<AlertsState> = {}) => mockedStatus.mockReturnValue({ state: { ...EMPTY, enabled: true, ...over }, refresh: refreshStatus });

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
  setAlerts = jest.fn();
  mockedAlerts.mockReturnValue({ on: true, busy: false, set: setAlerts });
  refreshStatus = jest.fn(async () => {});
  withStatus();
  sendTest.mockResolvedValue("sent");
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
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://web.test", BROWSER_OPTIONS);
    await fireEvent.press(screen.getByRole("link", { name: "Reset password" }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith("https://web.test/forgot-password", BROWSER_OPTIONS);
  });

  it("shows the app version", async () => {
    await renderSettings();
    expect(await screen.findByLabelText("Version, 1.2.3")).toBeTruthy();
  });
});

describe("notifications", () => {
  it("has a switch for new chapter notifications, showing whether they are on", async () => {
    await renderSettings();
    expect((await screen.findByLabelText("New chapter notifications")).props.value).toBe(true);
    mockedAlerts.mockReturnValue({ on: false, busy: false, set: setAlerts });
    await renderSettings();
    expect((await screen.findAllByLabelText("New chapter notifications")).at(-1)!.props.value).toBe(false);
  });

  it("turns them on and off", async () => {
    await renderSettings();
    const sw = await screen.findByLabelText("New chapter notifications");
    await fireEvent(sw, "valueChange", false);
    expect(setAlerts).toHaveBeenCalledWith(false);
    await fireEvent(sw, "valueChange", true);
    expect(setAlerts).toHaveBeenLastCalledWith(true);
  });

  it("is disabled until the saved choice is known, and while changing", async () => {
    mockedAlerts.mockReturnValue({ on: null, busy: false, set: setAlerts });
    await renderSettings();
    expect((await screen.findByLabelText("New chapter notifications")).props.disabled).toBe(true);
    mockedAlerts.mockReturnValue({ on: true, busy: true, set: setAlerts });
    await renderSettings();
    expect((await screen.findAllByLabelText("New chapter notifications")).at(-1)!.props.disabled).toBe(true);
  });

  it("says they are checked in the background, so late arrival is expected", async () => {
    await renderSettings();
    expect(await screen.findByText(/Checked in the background/)).toBeTruthy();
  });
});

describe("the account", () => {
  it("opens the change password screen inside the app", async () => {
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Change password" }));
    expect(router.push).toHaveBeenCalledWith("/change-password");
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it("still has the emailed reset link for a forgotten password", async () => {
    await renderSettings();
    expect(await screen.findByRole("link", { name: "Reset password" })).toBeTruthy();
  });
});

describe("the stats link", () => {
  it("opens all the stats once the numbers are loaded", async () => {
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "All your stats" }));
    expect(router.push).toHaveBeenCalledWith("/stats");
  });

  it("is not offered while the numbers are not there", async () => {
    list.mockReturnValue(new Promise(() => {}));
    await renderSettings();
    await screen.findByText("YOUR LIBRARY");
    expect(screen.queryByRole("button", { name: "All your stats" })).toBeNull();
  });
});

describe("exporting the library", () => {
  beforeEach(() => jest.spyOn(Alert, "alert").mockImplementation(() => {}));
  afterEach(() => (Alert.alert as jest.Mock).mockRestore());

  it("offers the library as CSV and as JSON", async () => {
    await renderSettings();
    expect(await screen.findByText("YOUR DATA")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Export library as CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export library as JSON" })).toBeTruthy();
  });

  it("shares the library it already has, in the format chosen", async () => {
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Export library as CSV" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith("csv", expect.arrayContaining([expect.objectContaining({ id: 1 })]));
    expect((share.mock.calls[0][1] as unknown[]).length).toBe(4);
    await fireEvent.press(screen.getByRole("button", { name: "Export library as JSON" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith("json", expect.any(Array)));
  });

  it("works offline, from the saved copy", async () => {
    setOnline(false);
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Export library as JSON" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  });

  it("shows it is busy, and ignores a second tap, while the share sheet is being prepared", async () => {
    let finish!: () => void;
    share.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderSettings();
    const csv = await screen.findByRole("button", { name: "Export library as CSV" });
    await fireEvent.press(csv);
    await waitFor(() => expect(screen.getByRole("button", { name: "Export library as CSV" }).props.accessibilityState.busy).toBe(true));
    await fireEvent.press(screen.getByRole("button", { name: "Export library as CSV" }));
    await fireEvent.press(screen.getByRole("button", { name: "Export library as JSON" }));
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(screen.getByRole("button", { name: "Export library as CSV" }).props.accessibilityState.busy).toBe(false));
  });

  it("says why it could not export", async () => {
    share.mockRejectedValue(new Error("Sharing isn't available on this device."));
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Export library as CSV" }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't export your library", "Sharing isn't available on this device."));
    expect(screen.getByRole("button", { name: "Export library as CSV" }).props.accessibilityState.busy).toBe(false);
  });

  it("tells you when there is nothing to export, instead of sharing an empty file", async () => {
    list.mockResolvedValue([]);
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Export library as CSV" }));
    expect(Alert.alert).toHaveBeenCalledWith("Nothing to export", expect.stringContaining("empty"));
    expect(share).not.toHaveBeenCalled();
  });

  it("cannot be tapped until the library has loaded", async () => {
    list.mockReturnValue(new Promise(() => {}));
    await renderSettings();
    await screen.findByText("YOUR DATA");
    expect(screen.queryByRole("button", { name: "Export library as CSV" })).toBeNull();
    expect(screen.getByLabelText("Export library as CSV")).toBeTruthy();
  });
});

describe("the notification status", () => {
  const MIN = 60_000;
  beforeEach(() => jest.spyOn(Alert, "alert").mockImplementation(() => {}));
  afterEach(() => (Alert.alert as jest.Mock).mockRestore());

  it("is not shown while notifications are off, or before the saved state has been read", async () => {
    mockedAlerts.mockReturnValue({ on: false, busy: false, set: setAlerts });
    await renderSettings();
    await screen.findByLabelText("New chapter notifications");
    expect(screen.queryByText("Last check")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send a test notification" })).toBeNull();
  });

  it("is not shown until the saved state has been read", async () => {
    mockedStatus.mockReturnValue({ state: null, refresh: refreshStatus });
    await renderSettings();
    await screen.findByLabelText("New chapter notifications");
    expect(screen.queryByText("Last check")).toBeNull();
  });

  it("says it is waiting for the first check when none has run", async () => {
    await renderSettings();
    expect(await screen.findByLabelText("Last check, Waiting for the first check")).toBeTruthy();
  });

  it("shows when the last check ran and how it went", async () => {
    withStatus({ lastCheck: { at: Date.now() - 12 * MIN, result: "nothing", shown: 0 } });
    await renderSettings();
    expect(await screen.findByLabelText("Last check, 12 min ago · nothing new")).toBeTruthy();
  });

  it("says how many notifications the last check showed", async () => {
    withStatus({ lastCheck: { at: Date.now() - 3 * MIN, result: "notified", shown: 2 } });
    await renderSettings();
    expect(await screen.findByLabelText("Last check, 3 min ago · 2 notifications shown")).toBeTruthy();
  });

  it("warns when the last check is much older than Android normally allows", async () => {
    withStatus({ lastCheck: { at: Date.now() - 9 * 60 * MIN, result: "nothing", shown: 0 } });
    await renderSettings();
    expect(await screen.findByLabelText("Last check, 9 h ago · later than expected")).toBeTruthy();
    expect(screen.getByText("9 h ago · later than expected").props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: "#FF5A5A" })]));
  });

  it("reads the status again each time the screen is shown", async () => {
    await renderSettings();
    await screen.findByText("Last check");
    expect(refreshStatus).toHaveBeenCalled();
  });

  it("shows how late alerts typically are, once there are enough to say", async () => {
    withStatus({ delays: [10, 50, 20, 40, 30] });
    await renderSettings();
    expect(await screen.findByLabelText("Alert delay, About 30 min")).toBeTruthy();
  });

  it("says there are not enough alerts yet to tell", async () => {
    withStatus({ delays: [10, 20] });
    await renderSettings();
    expect(await screen.findByLabelText("Alert delay, Not enough alerts yet")).toBeTruthy();
  });

  it("sends a test notification, and says nothing more when it works (the notification is the answer)", async () => {
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Send a test notification" }));
    await waitFor(() => expect(sendTest).toHaveBeenCalledTimes(1));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("ignores a second tap while the test is being sent", async () => {
    let finish!: (v: string) => void;
    sendTest.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Send a test notification" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send a test notification" }).props.accessibilityState.busy).toBe(true));
    await fireEvent.press(screen.getByRole("button", { name: "Send a test notification" }));
    expect(sendTest).toHaveBeenCalledTimes(1);
    await act(async () => finish("sent"));
  });

  it("explains, and offers the system settings, when notifications are blocked", async () => {
    sendTest.mockResolvedValue("no-permission");
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Send a test notification" }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Notifications are blocked", expect.stringContaining("Allow notifications"), expect.any(Array)));
    const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === "Open settings")!.onPress?.());
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it("says so when the test could not be sent", async () => {
    sendTest.mockRejectedValue(new Error("no channel"));
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Send a test notification" }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't send the test", expect.any(String)));
    expect(screen.getByRole("button", { name: "Send a test notification" }).props.accessibilityState.busy).toBe(false);
  });

  it("explains why alerts can be late, with a way to the app's battery settings", async () => {
    const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Alerts arriving late?" }));
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(title).toBe("Alerts arriving late?");
    expect(message).toMatch(/about once an hour/);
    expect(message).toMatch(/Unrestricted/);
    expect(message).toMatch(/It appears once a few alerts have arrived/);
    await act(async () => (buttons as { text: string; onPress?: () => void }[]).find((b) => b.text === "Open app settings")!.onPress?.());
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it("says how many alerts the delay is based on", async () => {
    withStatus({ delays: [10, 20, 30, 40, 50] });
    await renderSettings();
    await fireEvent.press(await screen.findByRole("button", { name: "Alerts arriving late?" }));
    expect((Alert.alert as jest.Mock).mock.calls.at(-1)![1]).toMatch(/the middle of your last 5/);
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
