/**
 * Navigation smoke test: renders the real route tree (src/app) with the network and native modules
 * mocked, to catch crashes and routing mistakes that typechecking and bundling cannot.
 */
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as h from "@/test-utils/smoke";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-splash-screen", () => require("@/test-utils/mocks").splashMock());
jest.mock("@/push/register", () => require("@/test-utils/mocks").pushMock());

beforeEach(() => h.resetClientState());

it("restores a stored session and lands on the empty library", async () => {
  h.store["mangly.refresh_token"] = "mpr_old";
  h.routeFetch({
    "/auth/mobile/refresh": () => h.json(200, h.pair),
    "/tracked-manga": () => h.json(200, []),
    "/notifications/unread-count": () => h.json(200, { count: 0 }),
  });
  renderRouter("./src/app", { initialUrl: "/" });
  await waitFor(() => expect(screen.getByText("Nothing here yet")).toBeTruthy(), { timeout: 5000 });
  expect(h.store["mangly.refresh_token"]).toBe("mpr_refresh"); // the rotated token was saved
});
