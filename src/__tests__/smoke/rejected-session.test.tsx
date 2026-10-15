/**
 * Navigation smoke test: renders the real route tree (src/app) with the network and native modules
 * mocked, to catch crashes and routing mistakes that typechecking and bundling cannot.
 */
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as h from "@/test-utils/smoke";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-splash-screen", () => require("@/test-utils/mocks").splashMock());
jest.mock("@/alerts", () => require("@/test-utils/mocks").alertsMock());

beforeEach(() => h.resetClientState());

it("falls back to sign-in when the server rejects the stored session", async () => {
  h.store["mangly.refresh_token"] = "mpr_revoked";
  h.routeFetch({ "/auth/mobile/refresh": () => h.json(401, { detail: "Invalid or expired refresh token." }) });
  renderRouter("./src/app", { initialUrl: "/" });
  await waitFor(() => expect(screen.getByText(h.SIGN_IN_TEXT)).toBeTruthy(), { timeout: 5000 });
  expect(h.store["mangly.refresh_token"]).toBeUndefined(); // a rejected token is discarded
});
