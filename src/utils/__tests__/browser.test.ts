import * as WebBrowser from "expo-web-browser";
import { palette } from "@/theme";
import { BROWSER_OPTIONS, isWebLink, openInBrowser, warmUpBrowser } from "../browser";

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(async () => ({ type: "cancel" })),
  warmUpAsync: jest.fn(async () => ({})),
  mayInitWithUrlAsync: jest.fn(async () => ({})),
}));

const open = WebBrowser.openBrowserAsync as jest.Mock;
const warm = WebBrowser.warmUpAsync as jest.Mock;
const mayInit = WebBrowser.mayInitWithUrlAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  warm.mockResolvedValue({});
  mayInit.mockResolvedValue({});
});

describe("how pages are shown", () => {
  it("opens in the app's own task, so the app is not left as far as Android's recent apps can tell", () => {
    expect(BROWSER_OPTIONS.createTask).toBe(false);
  });

  it("takes the app's colours, shows the page title and gets out of the way while scrolling", () => {
    expect(BROWSER_OPTIONS).toMatchObject({ toolbarColor: palette.bg, controlsColor: palette.text, showTitle: true, enableBarCollapsing: true });
  });

  it("opens the link it is given with those options", async () => {
    await openInBrowser("https://x.test/chapter-1/");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("https://x.test/chapter-1/", BROWSER_OPTIONS);
  });

  it("passes on the result of the browser, so a caller can tell whether it was dismissed", async () => {
    await expect(openInBrowser("https://x.test/")).resolves.toEqual({ type: "cancel" });
  });
});

describe("getting the browser ready", () => {
  it("starts the browser and tells it which page is likely next", async () => {
    await warmUpBrowser("https://x.test/latest");
    expect(warm).toHaveBeenCalledTimes(1);
    expect(mayInit).toHaveBeenCalledWith("https://x.test/latest");
  });

  it("only starts the browser when there is no page to suggest", async () => {
    await warmUpBrowser();
    await warmUpBrowser(null);
    expect(warm).toHaveBeenCalledTimes(2);
    expect(mayInit).not.toHaveBeenCalled();
  });

  it("never throws, whatever the browser does: it is only a hint", async () => {
    warm.mockRejectedValue(new Error("no Custom Tabs browser"));
    await expect(warmUpBrowser("https://x.test/")).resolves.toBeUndefined();
    warm.mockResolvedValue({});
    mayInit.mockRejectedValue(new Error("service gone"));
    await expect(warmUpBrowser("https://x.test/")).resolves.toBeUndefined();
  });

  it("does not suggest a page when the browser could not be started", async () => {
    warm.mockRejectedValue(new Error("no Custom Tabs browser"));
    await warmUpBrowser("https://x.test/");
    expect(mayInit).not.toHaveBeenCalled();
  });
});

describe("isWebLink", () => {
  it.each(["https://x.test/a", "http://x.test/a", "HTTPS://X.TEST/A"])("accepts %s", (url) => {
    expect(isWebLink(url)).toBe(true);
  });
  it.each([null, undefined, "", "javascript:alert(1)", "intent://x#Intent;end", "file:///etc/passwd", "mangly://x", "//x.test/a", "x.test/a", " https://x.test"])("refuses %p", (url) => {
    expect(isWebLink(url)).toBe(false);
  });
});

