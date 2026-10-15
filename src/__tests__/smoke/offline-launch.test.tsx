/**
 * Navigation smoke test: renders the real route tree (src/app) with the network and native modules
 * mocked, to catch crashes and routing mistakes that typechecking and bundling cannot.
 */
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as h from "@/test-utils/smoke";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-splash-screen", () => require("@/test-utils/mocks").splashMock());
jest.mock("@/alerts", () => require("@/test-utils/mocks").alertsMock());

beforeEach(() => h.resetClientState());

it("keeps the user signed in when the device is offline at launch, and renews the session once it is back", async () => {
  h.store["mangly.refresh_token"] = "mpr_old";
  h.offlineFetch();
  renderRouter("./src/app", { initialUrl: "/" });

  // not the login form: the session is still good, there is just no connection
  await waitFor(() => expect(screen.getByText("Can't reach MangaPulse")).toBeTruthy(), { timeout: 5000 });
  expect(screen.queryByText(h.SIGN_IN_TEXT)).toBeNull();
  expect(h.store["mangly.refresh_token"]).toBe("mpr_old"); // not lost just because of a dead connection

  // the connection comes back and the user taps Try again: the stored session is renewed
  h.routeFetch({ "/auth/mobile/refresh": () => h.json(200, h.pair) });
  await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(h.store["mangly.refresh_token"]).toBe("mpr_refresh"), { timeout: 5000 });
  // (Moving on from the "can't reach" screen once signed in is checked in AuthContext.test and in a real navigator in the
  // browser: the jest router does not act on route guards changing, so it cannot show that part.)
});
