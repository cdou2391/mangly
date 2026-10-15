import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Register from "@/app/(auth)/register";
import { ApiError } from "@/api/client";
import { authApi } from "@/api/endpoints";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
const mockSignIn = jest.fn();
jest.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
jest.mock("@/api/endpoints", () => ({ authApi: { register: jest.fn() } }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

const register = authApi.register as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.mockReset();
  mockSignIn.mockResolvedValue(undefined);
  register.mockResolvedValue({ id: 5 });
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderRegister = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Register />
    </SafeAreaProvider>,
  );

const create = () => screen.getByRole("button", { name: "Create account" });
async function fillIn(name = "Ada Lovelace", email = "ada@example.com", password = "analytic1") {
  await fireEvent.changeText(screen.getByPlaceholderText("Name"), name);
  await fireEvent.changeText(screen.getByPlaceholderText("Email"), email);
  await fireEvent.changeText(screen.getByPlaceholderText("Password"), password);
}

describe("checking the form", () => {
  it("explains what is wrong and does not call the server", async () => {
    await renderRegister();
    await fireEvent.press(create());
    expect(screen.getByText("Enter your name.")).toBeTruthy();
    expect(screen.getByText("Enter a valid email.")).toBeTruthy();
    expect(screen.getByText("At least 8 characters.")).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows the first broken password rule, not the last", async () => {
    await renderRegister();
    await fillIn("Ada", "ada@example.com", "abc");
    await fireEvent.press(create());
    expect(screen.getByText("At least 8 characters.")).toBeTruthy();
    expect(screen.queryByText("Include a number.")).toBeNull();
  });

  it("explains a password that is too long in bytes, instead of letting the server fail", async () => {
    await renderRegister();
    await fillIn("Ada", "ada@example.com", "é".repeat(40) + "a1");
    await fireEvent.press(create());
    expect(screen.getByText(/Too long/)).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it("clears the messages once the form is right", async () => {
    await renderRegister();
    await fireEvent.press(create());
    await fillIn();
    await fireEvent.press(create());
    expect(screen.queryByText("Enter your name.")).toBeNull();
    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe("creating the account", () => {
  it("registers with the trimmed details, then signs in with the same email and password", async () => {
    await renderRegister();
    await fillIn("  Ada Lovelace ", " Ada@Example.com ", "analytic1");
    await fireEvent.press(create());
    expect(register).toHaveBeenCalledWith({ full_name: "Ada Lovelace", email: "Ada@Example.com", password: "analytic1" });
    expect(mockSignIn).toHaveBeenCalledWith("Ada@Example.com", "analytic1");
    expect(register.mock.invocationCallOrder[0]).toBeLessThan(mockSignIn.mock.invocationCallOrder[0]);
  });

  it("can be sent from the keyboard's go key on the password field", async () => {
    await renderRegister();
    await fillIn();
    await fireEvent(screen.getByPlaceholderText("Password"), "submitEditing");
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("sends one request when pressed twice in the same instant", async () => {
    let finish!: () => void;
    register.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ id: 5 }))));
    await renderRegister();
    await fillIn();
    await act(async () => {
      void screen.getByPlaceholderText("Password").props.onSubmitEditing();
      void screen.getByPlaceholderText("Password").props.onSubmitEditing();
    });
    expect(register).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("says when the email is taken, in the server's words", async () => {
    register.mockRejectedValue(new ApiError(409, "An account with this email already exists."));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    expect(await screen.findByText("An account with this email already exists.")).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("says plainly when it is rate limited", async () => {
    register.mockRejectedValue(new ApiError(429, "Rate limit exceeded: 5 per 1 minute"));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    expect(await screen.findByText("Too many attempts. Wait a minute and try again.")).toBeTruthy();
  });

  it("does not show a server error's internals", async () => {
    register.mockRejectedValue(new ApiError(500, "Internal server error"));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    expect(await screen.findByText("We couldn't create your account right now. Try again in a moment.")).toBeTruthy();
    expect(screen.queryByText("Internal server error")).toBeNull();
  });

  it("tells the user when they are offline", async () => {
    register.mockRejectedValue(new ApiError(0, "Network error. Check your connection."));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    expect(await screen.findByText("Network error. Check your connection.")).toBeTruthy();
  });

  it("can be tried again after a failure", async () => {
    register.mockRejectedValueOnce(new ApiError(0, "Network error. Check your connection."));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    await screen.findByText("Network error. Check your connection.");
    await fireEvent.press(create());
    expect(register).toHaveBeenCalledTimes(2);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Network error. Check your connection.")).toBeNull();
  });
});

describe("when the account is made but signing in fails", () => {
  it("says the account exists, and a second tap only signs in instead of registering again", async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError(0, "Network error. Check your connection."));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    expect(await screen.findByText(/Your account is ready, but we couldn't sign you in\. Network error\./)).toBeTruthy();

    await fireEvent.press(create());
    expect(register).toHaveBeenCalledTimes(1); // not registered a second time, which the server would refuse as a duplicate
    expect(mockSignIn).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Your account is ready/)).toBeNull();
  });

  it("registers again if the details were changed, since that is a different account", async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError(0, "Network error. Check your connection."));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    await screen.findByText(/Your account is ready/);
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "other@example.com");
    await fireEvent.press(create());
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("does not claim the new account exists when registering a changed email fails", async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError(0, "Network error. Check your connection."));
    await renderRegister();
    await fillIn();
    await fireEvent.press(create());
    await screen.findByText(/Your account is ready/);
    register.mockRejectedValueOnce(new ApiError(409, "An account with this email already exists."));
    await fireEvent.changeText(screen.getByPlaceholderText("Email"), "taken@example.com");
    await fireEvent.press(create());
    expect(await screen.findByText("An account with this email already exists.")).toBeTruthy();
    expect(screen.queryByText(/Your account is ready/)).toBeNull();
  });
});

it("goes to the login screen from 'I already have an account'", async () => {
  await renderRegister();
  await fireEvent.press(screen.getByRole("button", { name: "I already have an account" }));
  expect(router.replace).toHaveBeenCalledWith("/login");
});
