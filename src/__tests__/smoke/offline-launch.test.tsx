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

it("keeps the stored session when the device is offline at launch", async () => {
  h.store["mangly.refresh_token"] = "mpr_old";
  h.offlineFetch();
  renderRouter("./src/app", { initialUrl: "/" });
  await waitFor(() => expect(screen.getByText(h.SIGN_IN_TEXT)).toBeTruthy(), { timeout: 5000 });
  expect(h.store["mangly.refresh_token"]).toBe("mpr_old"); // not lost just because of a dead connection
});
