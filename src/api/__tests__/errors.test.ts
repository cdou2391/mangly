import { ApiError } from "../client";
import { describeError } from "../errors";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());

describe("describeError", () => {
  it("explains the rate limit in plain words", () => {
    expect(describeError(new ApiError(429, "Rate limit exceeded: 20 per 1 minute"), "search")).toMatch(/too fast/);
  });
  it("keeps the message for offline and timeouts, which is already worded for the user", () => {
    expect(describeError(new ApiError(0, "Network error. Check your connection."), "track")).toBe("Network error. Check your connection.");
  });
  it("does not show a server error's internals, and says what to do", () => {
    expect(describeError(new ApiError(500, "Traceback ..."), "search")).toMatch(/search service/);
    expect(describeError(new ApiError(502, "Could not fetch manga details. Please try again later."), "track")).toMatch(/source site may be down/);
  });
  it("shows what the server said for a rejected request", () => {
    expect(describeError(new ApiError(422, "Value error, url host is not an allowed source"), "track")).toBe("Value error, url host is not an allowed source");
  });
  it("copes with anything else", () => {
    expect(describeError(new Error("boom"), "search")).toBe("boom");
    expect(describeError("weird", "search")).toBe("Something went wrong.");
  });
});

describe("describeError when registering", () => {
  it("words the rate limit and server errors for someone creating an account", () => {
    expect(describeError(new ApiError(429, "Rate limit exceeded: 5 per 1 minute"), "register")).toBe("Too many attempts. Wait a minute and try again.");
    expect(describeError(new ApiError(500, "Internal server error"), "register")).toMatch(/couldn't create your account/);
  });
  it("keeps the server's words for a taken email", () => {
    expect(describeError(new ApiError(409, "An account with this email already exists."), "register")).toBe("An account with this email already exists.");
  });
});

describe("describeError when previewing", () => {
  it("says the source site may be down for a server error, and keeps the other wording", () => {
    expect(describeError(new ApiError(502, "Could not fetch"), "preview")).toMatch(/Couldn't load the preview.*source site may be down/);
    expect(describeError(new ApiError(429, "Rate limit exceeded"), "preview")).toMatch(/too fast/);
    expect(describeError(new ApiError(0, "Network error. Check your connection."), "preview")).toBe("Network error. Check your connection.");
    expect(describeError(new ApiError(400, "Invalid manga URL for source 'x'"), "preview")).toBe("Invalid manga URL for source 'x'");
  });
});
