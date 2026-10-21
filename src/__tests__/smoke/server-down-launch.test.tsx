/**
 * Navigation smoke test: a server error while restoring the session is not a refusal, so it must not send the user to log in,
 * and the user can still choose to sign out from the "can't reach" screen (that it asks first and then signs out is tested in offline-screen).
 */
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as h from "@/test-utils/smoke";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-splash-screen", () => require("@/test-utils/mocks").splashMock());
jest.mock("@/alerts", () => require("@/test-utils/mocks").alertsMock());

beforeEach(() => h.resetClientState());

it("shows the 'can't reach' screen when the server errors at launch, and still shows the Sign out choice", async () => {
  h.store["mangly.refresh_token"] = "mpr_old";
  h.routeFetch({
    "/auth/mobile/refresh": () => h.json(503, { detail: "Service unavailable" }),
    "/auth/mobile/logout": () => h.json(200, { message: "ok" }),
  });
  renderRouter("./src/app", { initialUrl: "/" });

  await waitFor(() => expect(screen.getByText("Can't reach MangaPulse")).toBeTruthy(), { timeout: 5000 });
  expect(h.store["mangly.refresh_token"]).toBe("mpr_old");

  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy(); // signing out itself is tested with the screen (offline-screen) and with the session (AuthContext)
});
