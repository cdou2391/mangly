import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Offline from "@/app/offline";

const mockSignOut = jest.fn();
const mockRetry = jest.fn();
jest.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ signOut: mockSignOut, retry: mockRetry }) }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderOffline = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Offline />
    </SafeAreaProvider>,
  );
const dialog = () => within(screen.getByTestId("confirm-dialog"));

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockRetry.mockReset().mockResolvedValue(undefined);
});

describe("signing out from the can't-reach screen", () => {
  it("asks first, in the app's own dialog, and does nothing if cancelled", async () => {
    await renderOffline();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(dialog().getByText("Sign out?")).toBeTruthy();
    expect(dialog().getByText(/log in again with your email and password/)).toBeTruthy();
    await fireEvent.press(dialog().getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs out once confirmed", async () => {
    await renderOffline();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    await fireEvent.press(dialog().getByRole("button", { name: "Sign out" }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("tries again without asking anything", async () => {
    await renderOffline();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Try again" })));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });
});
