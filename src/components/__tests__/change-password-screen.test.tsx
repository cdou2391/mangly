import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import ChangePassword from "@/app/change-password";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

jest.mock("@/auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));

let changePassword: jest.Mock;
const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ChangePassword />
    </SafeAreaProvider>,
  );

const field = (label: string) => screen.getByLabelText(label);
async function fill(current = "old-pass1", next = "new-pass2", confirm = next) {
  await fireEvent.changeText(field("Current password"), current);
  await fireEvent.changeText(field("New password"), next);
  await fireEvent.changeText(field("Confirm new password"), confirm);
}
const submit = () => fireEvent.press(screen.getByRole("button", { name: "Change password" }));

beforeEach(() => {
  jest.clearAllMocks();
  changePassword = jest.fn(async () => true);
  (useAuth as jest.Mock).mockReturnValue({ changePassword });
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe("the form", () => {
  it("has three password fields, each with a show/hide toggle, and a way back", async () => {
    await renderScreen();
    expect(field("Current password")).toBeTruthy();
    expect(field("New password")).toBeTruthy();
    expect(field("Confirm new password")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Show password" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByText("Other devices signed in to your account will be signed out.")).toBeTruthy();
  });

  it("keeps the passwords hidden until asked", async () => {
    await renderScreen();
    expect(field("New password").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getAllByRole("button", { name: "Show password" })[1]);
    expect(field("New password").props.secureTextEntry).toBe(false);
    expect(field("Current password").props.secureTextEntry).toBe(true);
  });

  it("tells the keyboard what each field is, so a password manager can help", async () => {
    await renderScreen();
    expect(field("Current password").props.autoComplete).toBe("current-password");
    expect(field("New password").props.autoComplete).toBe("new-password");
  });
});

describe("checking before asking the server", () => {
  it("asks for the current password", async () => {
    await renderScreen();
    await fill("");
    await submit();
    expect(screen.getByText("Enter your current password.")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it.each([
    ["short1", "At least 8 characters."],
    ["12345678", "Include a letter."],
    ["abcdefgh", "Include a number."],
  ])("explains why %s is not a good new password", async (next, message) => {
    await renderScreen();
    await fill("old-pass1", next);
    await submit();
    expect(screen.getByText(message)).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("will not take the current password as the new one", async () => {
    await renderScreen();
    await fill("same-pass1", "same-pass1");
    await submit();
    expect(screen.getByText("Choose a password different from the current one.")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("wants the new password typed twice the same", async () => {
    await renderScreen();
    await fill("old-pass1", "new-pass2", "new-pass3");
    await submit();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows every problem at once, and clears them once fixed", async () => {
    await renderScreen();
    await fill("", "x", "y");
    await submit();
    expect(screen.getByText("Enter your current password.")).toBeTruthy();
    expect(screen.getByText("At least 8 characters.")).toBeTruthy();
    expect(screen.getByText("The passwords don't match.")).toBeTruthy();
    await fill();
    await submit();
    await waitFor(() => expect(changePassword).toHaveBeenCalled());
    expect(screen.queryByText("Enter your current password.")).toBeNull();
  });
});

describe("changing it", () => {
  it("sends the current and the new password, then says it is done", async () => {
    await renderScreen();
    await fill();
    await submit();
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith("old-pass1", "new-pass2"));
    expect(await screen.findByText("Password changed")).toBeTruthy();
    expect(screen.getByText(/still signed in here/)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull(); // the form, and what was typed, is gone
  });

  it("goes back when Done is pressed", async () => {
    await renderScreen();
    await fill();
    await submit();
    await fireEvent.press(await screen.findByRole("button", { name: "Done" }));
    expect(router.back).toHaveBeenCalled();
  });

  it("goes to Settings when there is nothing to go back to", async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    await renderScreen();
    await fill();
    await submit();
    await fireEvent.press(await screen.findByRole("button", { name: "Done" }));
    expect(router.replace).toHaveBeenCalledWith("/settings");
  });

  it("sends once when submitted twice in the same instant, and shows it is busy", async () => {
    let finish!: (v: boolean) => void;
    changePassword.mockReturnValue(new Promise<boolean>((resolve) => (finish = resolve)));
    await renderScreen();
    await fill();
    await act(async () => {
      void field("Confirm new password").props.onSubmitEditing();
      void field("Confirm new password").props.onSubmitEditing();
    });
    expect(changePassword).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Change password" }).props.accessibilityState.busy).toBe(true);
    await act(async () => finish(true));
    expect(await screen.findByText("Password changed")).toBeTruthy();
  });

  it("puts the server's 'incorrect password' under the current password field, and lets you try again", async () => {
    changePassword.mockRejectedValueOnce(new ApiError(400, "Current password is incorrect."));
    await renderScreen();
    await fill("wrong-pass1");
    await submit();
    const message = await screen.findByText("Current password is incorrect.");
    expect(message.props.accessibilityLiveRegion).toBeUndefined(); // it sits under the field, not in the form-wide message below the fields
    expect(screen.getByLabelText("New password").props.value).toBe("new-pass2"); // nothing typed is lost
    await fill("right-pass1");
    await submit();
    expect(await screen.findByText("Password changed")).toBeTruthy();
  });

  it("shows any other refusal below the fields, in the server's words", async () => {
    changePassword.mockRejectedValue(new ApiError(422, "Value error, Password must contain at least one number."));
    await renderScreen();
    await fill();
    await submit();
    const message = await screen.findByText("Value error, Password must contain at least one number.");
    expect(message.props.accessibilityLiveRegion).toBe("polite");
  });

  it("asks to try again later when the server cannot be reached", async () => {
    changePassword.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderScreen();
    await fill();
    await submit();
    expect(await screen.findByText("Can't reach MangaPulse. Check your connection and try again later.")).toBeTruthy();
    expect(screen.queryByText("Password changed")).toBeNull();
  });

  it("tells you to wait when tried too often", async () => {
    changePassword.mockRejectedValue(new ApiError(429, "Rate limit exceeded: 5 per 1 minute"));
    await renderScreen();
    await fill();
    await submit();
    expect(await screen.findByText("Too many attempts. Wait a minute and try again.")).toBeTruthy();
  });

  it("does not show a server error's internals", async () => {
    changePassword.mockRejectedValue(new ApiError(500, "Traceback ..."));
    await renderScreen();
    await fill();
    await submit();
    expect(await screen.findByText(/couldn't change your password right now/)).toBeTruthy();
    expect(screen.queryByText(/Traceback/)).toBeNull();
  });

  it("stays on the form when the device was signed out afterwards (the app then shows the login screen)", async () => {
    changePassword.mockResolvedValue(false);
    await renderScreen();
    await fill();
    await submit();
    await waitFor(() => expect(changePassword).toHaveBeenCalled());
    expect(screen.queryByText("Password changed")).toBeNull();
  });
});
