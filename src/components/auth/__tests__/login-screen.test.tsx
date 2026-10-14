import { Keyboard, Platform, StyleSheet, TextInput } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Login from "@/app/(auth)/login";

const mockSignIn = jest.fn();
jest.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

beforeEach(() => {
  mockSignIn.mockReset();
  (router.push as jest.Mock).mockClear();
  (WebBrowser.openBrowserAsync as jest.Mock).mockClear();
});

// Expo Router supplies the safe-area provider in the app; here it has to be provided by hand.
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderLogin = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Login />
    </SafeAreaProvider>,
  );

const email = () => screen.getByPlaceholderText("Email");
const password = () => screen.getByPlaceholderText("Password");
const logIn = () => screen.getByRole("button", { name: "Log In" });

it("rejects an empty form without calling the server", async () => {
  await renderLogin();
  await fireEvent.press(logIn());
  expect(screen.getByText("Enter a valid email.")).toBeTruthy();
  expect(screen.getByText("Enter your password.")).toBeTruthy();
  expect(mockSignIn).not.toHaveBeenCalled();
});

it("rejects a malformed email", async () => {
  await renderLogin();
  await fireEvent.changeText(email(), "not-an-email");
  await fireEvent.changeText(password(), "secret");
  await fireEvent.press(logIn());
  expect(screen.getByText("Enter a valid email.")).toBeTruthy();
  expect(mockSignIn).not.toHaveBeenCalled();
});

it("signs in with the trimmed email and the password exactly as typed", async () => {
  mockSignIn.mockResolvedValue(undefined);
  await renderLogin();
  await fireEvent.changeText(email(), "  ada@example.com ");
  await fireEvent.changeText(password(), " pass word ");
  await fireEvent.press(logIn());
  expect(mockSignIn).toHaveBeenCalledWith("ada@example.com", " pass word "); // passwords are never trimmed
});

it("shows the server's message when sign-in fails, and lets the user retry", async () => {
  mockSignIn.mockRejectedValueOnce(new Error("Invalid email or password."));
  await renderLogin();
  await fireEvent.changeText(email(), "ada@example.com");
  await fireEvent.changeText(password(), "wrong");
  await fireEvent.press(logIn());
  expect(await screen.findByText("Invalid email or password.")).toBeTruthy();

  mockSignIn.mockResolvedValueOnce(undefined);
  await fireEvent.press(logIn());
  expect(mockSignIn).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Invalid email or password.")).toBeNull();
});

it("ignores a second submit while a sign-in is in flight, even within the same tick", async () => {
  let finish!: () => void;
  mockSignIn.mockReturnValue(new Promise<void>((r) => (finish = r)));
  await renderLogin();
  await fireEvent.changeText(email(), "ada@example.com");
  await fireEvent.changeText(password(), "secret");

  const submit = password().props.onSubmitEditing as () => void; // the keyboard's Go key
  await act(async () => {
    submit();
    submit(); // before React has re-rendered with the busy state
  });
  expect(mockSignIn).toHaveBeenCalledTimes(1);

  await act(async () => finish());
});

it("hides the password until the eye is pressed", async () => {
  await renderLogin();
  expect(password().props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
  expect(password().props.secureTextEntry).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "Hide password" }));
  expect(password().props.secureTextEntry).toBe(true);
});

it("opens the web password reset page", async () => {
  await renderLogin();
  await fireEvent.press(screen.getByText("Forgot password?"));
  const url = (WebBrowser.openBrowserAsync as jest.Mock).mock.calls[0][0] as string;
  expect(url.endsWith("/forgot-password")).toBe(true);
  expect(url).not.toContain("/api/v1");
});

it("goes to registration from Create account", async () => {
  await renderLogin();
  await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
  expect(router.push).toHaveBeenCalledWith("/register");
});

describe("with the keyboard", () => {
  // Capture the listeners the screen registers so the test can open and close the keyboard.
  let handlers: Record<string, (e?: unknown) => void>;
  beforeEach(() => {
    handlers = {};
    jest.replaceProperty(Platform, "OS", "android"); // the app only ships on Android; jest defaults to iOS
    jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, cb: (e?: unknown) => void) => {
      handlers[event] = cb;
      return { remove: jest.fn() };
    }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  const openKeyboard = (height = 320) =>
    act(async () => handlers.keyboardDidShow({ endCoordinates: { height } }));
  const closeKeyboard = () => act(async () => handlers.keyboardDidHide());
  const bottomPadding = () =>
    StyleSheet.flatten(screen.getByTestId("auth-scroll").props.contentContainerStyle).paddingBottom as number;

  it("does not measure or scroll after the screen has been unmounted", async () => {
    jest.useFakeTimers();
    try {
      const spy = jest.spyOn(TextInput.State, "currentlyFocusedInput");
      const view = await renderLogin();
      await openKeyboard(); // schedules the "scroll the field into view" measurement
      await view.unmount(); // the user navigates away before it fires
      await act(async () => void jest.advanceTimersByTime(1000));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the full header and footer while the keyboard is closed", async () => {
    await renderLogin();
    expect(screen.getByText("MANGA LIVES HERE")).toBeTruthy();
    expect(screen.getByText("BELONG")).toBeTruthy();
  });

  it("collapses the header and drops the footer when the keyboard opens, and restores them after", async () => {
    await renderLogin();
    await openKeyboard();
    expect(screen.queryByText("MANGA LIVES HERE")).toBeNull();
    expect(screen.queryByText("BELONG")).toBeNull();
    // the form itself stays put
    expect(email()).toBeTruthy();
    expect(logIn()).toBeTruthy();

    await closeKeyboard();
    expect(screen.getByText("MANGA LIVES HERE")).toBeTruthy();
    expect(screen.getByText("BELONG")).toBeTruthy();
  });

  it("reserves room under the content for the keyboard so the form can scroll clear of it", async () => {
    await renderLogin();
    const closed = bottomPadding();
    await openKeyboard(320);
    expect(bottomPadding()).toBeGreaterThanOrEqual(320);
    await closeKeyboard();
    expect(bottomPadding()).toBe(closed);
  });
});
