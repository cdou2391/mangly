/**
 * Navigation smoke test: a server error while restoring the session is not a refusal, so it must not send the user to log in,
 * and the user can still choose to sign out from the "can't reach" screen.
 */
import { Alert } from "react-native";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as h from "@/test-utils/smoke";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-splash-screen", () => require("@/test-utils/mocks").splashMock());
jest.mock("@/push/register", () => require("@/test-utils/mocks").pushMock());

beforeEach(() => h.resetClientState());

it("shows the 'can't reach' screen when the server errors at launch, and lets the user sign out of it", async () => {
  h.store["mangly.refresh_token"] = "mpr_old";
  h.routeFetch({
    "/auth/mobile/refresh": () => h.json(503, { detail: "Service unavailable" }),
    "/auth/mobile/logout": () => h.json(200, { message: "ok" }),
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  renderRouter("./src/app", { initialUrl: "/" });

  await waitFor(() => expect(screen.getByText("Can't reach MangaPulse")).toBeTruthy(), { timeout: 5000 });
  expect(h.store["mangly.refresh_token"]).toBe("mpr_old");

  await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === "Sign out")!.onPress?.());

  // the stored session is gone (the screen then follows it to the login form, which the jest router cannot show: see offline-launch)
  await waitFor(() => expect(h.store["mangly.refresh_token"]).toBeUndefined(), { timeout: 5000 });
  const paths = (globalThis.fetch as jest.Mock).mock.calls.map((c: unknown[]) => String(c[0]));
  expect(paths.some((p) => p.includes("/auth/mobile/logout"))).toBe(true);
});
