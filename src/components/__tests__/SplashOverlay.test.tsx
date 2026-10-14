import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";
import { SplashOverlay } from "../SplashOverlay";

jest.mock("expo-splash-screen", () => ({
  hideAsync: jest.fn(async () => {}),
  preventAutoHideAsync: jest.fn(async () => true),
}));
// expo-image is native; a plain host component lets the test trigger its load events.
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props: object) => <View testID="art" {...props} /> };
});
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

const hide = SplashScreen.hideAsync as jest.Mock;
// The artwork is decorative and hidden from screen readers, so queries must opt in to hidden elements.
const art = () => screen.getByTestId("art", { hidden: true });
const maybeArt = () => screen.queryByTestId("art", { hidden: true });

beforeEach(() => {
  jest.useFakeTimers();
  hide.mockClear();
});
afterEach(() => jest.useRealTimers());

const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

it("hands over from the native splash once the artwork has loaded, and only once", async () => {
  await render(<SplashOverlay appReady={false} />);
  expect(hide).not.toHaveBeenCalled(); // the native splash stays up until there is something to show

  await fireEvent(art(), "load");
  await fireEvent(art(), "load");
  expect(hide).toHaveBeenCalledTimes(1);
});

it("never leaves the native splash stuck if the artwork cannot load", async () => {
  await render(<SplashOverlay appReady={false} />);
  await advance(2400);
  expect(hide).not.toHaveBeenCalled();
  await advance(200);
  expect(hide).toHaveBeenCalledTimes(1);
});

it("hides the native splash when the artwork errors", async () => {
  await render(<SplashOverlay appReady={false} />);
  await fireEvent(art(), "error");
  expect(hide).toHaveBeenCalledTimes(1);
});

it("stays on screen while the app is still loading, however long that takes", async () => {
  await render(<SplashOverlay appReady={false} />);
  await advance(10_000);
  expect(art()).toBeTruthy();
});

it("stays for the minimum time even if the app is ready immediately", async () => {
  await render(<SplashOverlay appReady />);
  await advance(1300);
  expect(art()).toBeTruthy();
});

it("fades out and unmounts once the app is ready and the minimum time has passed", async () => {
  await render(<SplashOverlay appReady />);
  await advance(1400); // minimum visible time
  await advance(1000); // fade
  expect(maybeArt()).toBeNull();
});
