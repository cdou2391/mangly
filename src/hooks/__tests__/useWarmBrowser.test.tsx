import { renderHook } from "@testing-library/react-native";
import { warmUpBrowser } from "@/utils/browser";
import { useWarmBrowser } from "../useWarmBrowser";

jest.mock("@/utils/browser", () => ({ warmUpBrowser: jest.fn(async () => {}) }));
const warm = warmUpBrowser as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it("gets the browser ready when the screen appears", async () => {
  await renderHook(() => useWarmBrowser("https://x.test/latest"));
  expect(warm).toHaveBeenCalledTimes(1);
  expect(warm).toHaveBeenCalledWith("https://x.test/latest");
});

it("gets it ready without a page when there is none to suggest", async () => {
  await renderHook(() => useWarmBrowser());
  expect(warm).toHaveBeenCalledWith(undefined);
});

it("tells it about the new page when the likely page changes, and not on other re-renders", async () => {
  const { rerender } = await renderHook(({ url }: { url: string }) => useWarmBrowser(url), { initialProps: { url: "https://x.test/1" } });
  await rerender({ url: "https://x.test/1" });
  expect(warm).toHaveBeenCalledTimes(1);
  await rerender({ url: "https://x.test/2" });
  expect(warm).toHaveBeenCalledTimes(2);
  expect(warm).toHaveBeenLastCalledWith("https://x.test/2");
});
