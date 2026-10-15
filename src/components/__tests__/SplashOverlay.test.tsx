import { AccessibilityInfo, Animated, StyleSheet } from "react-native";
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

// Jest has no native animation engine, so values driven natively never reach the rendered style. Drive them in JS here so the
// beat can be observed; the animation itself is the same.
beforeAll(() => {
  const helper = require("react-native/src/private/animated/NativeAnimatedHelper").default;
  jest.spyOn(helper, "shouldUseNativeDriver").mockReturnValue(false);
});

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

describe("the logo", () => {
  const scaleOf = () => {
    const style = StyleSheet.flatten(screen.getByTestId("splash-beat", { hidden: true }).props.style);
    return style.transform[0].scale as number;
  };

  it("sits in the middle, big", async () => {
    await render(<SplashOverlay appReady={false} />);
    const logo = StyleSheet.flatten(screen.getByTestId("splash-logo", { hidden: true }).props.style);
    expect(logo.width).toBeGreaterThan(250); // jest's default window is 750 wide
    expect(logo.width).toBe(logo.height);
  });

  it("beats while the app is loading: grows on each thump and settles back", async () => {
    await render(<SplashOverlay appReady={false} />);
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      await advance(50);
      seen.push(scaleOf());
    }
    expect(Math.max(...seen)).toBeGreaterThan(1.05); // thump
    expect(Math.min(...seen)).toBeLessThan(1.02); // rest
    // two separate thumps in the first beat (lub-dub), not one
    const peaks = seen.filter((v, i) => i > 0 && i < seen.length - 1 && v > 1.05 && v >= seen[i - 1] && v >= seen[i + 1]);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
  });

  it("sends out a red ripple with every beat, not just the first", async () => {
    await render(<SplashOverlay appReady={false} />);
    const rippleOpacity = () => StyleSheet.flatten(screen.getByTestId("splash-ripple", { hidden: true }).props.style).opacity as number;
    const rippleStarts = async (ms: number) => {
      let starts = 0;
      let prev = 0;
      for (let t = 0; t < ms; t += 25) {
        await advance(25);
        const now = rippleOpacity();
        if (now > prev + 0.2) starts++; // a new ripple appears: opacity jumps up from (nearly) nothing
        prev = now;
      }
      return starts;
    };
    expect(await rippleStarts(5000)).toBeGreaterThanOrEqual(3); // 1.5 s per beat
  });

  it("keeps beating for as long as loading takes", async () => {
    await render(<SplashOverlay appReady={false} />);
    await advance(30_000);
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      await advance(50);
      seen.push(scaleOf());
    }
    expect(Math.max(...seen)).toBeGreaterThan(1.05);
  });

  it("stays still when the user has asked for reduced motion", async () => {
    const reduceMotion = jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(<SplashOverlay appReady={false} />);
    await advance(1500);
    expect(scaleOf()).toBe(1);
    reduceMotion.mockRestore();
  });

  it("stops the beat once the splash is gone, so nothing keeps animating behind the app", async () => {
    const stops: jest.SpyInstance[] = [];
    const realLoop = Animated.loop;
    const loopSpy = jest.spyOn(Animated, "loop").mockImplementation((anim, cfg) => {
      const loop = realLoop(anim, cfg);
      const stop = jest.spyOn(loop, "stop");
      stops.push(stop);
      return loop;
    });
    await render(<SplashOverlay appReady />);
    await advance(100);
    expect(stops).toHaveLength(1);
    expect(stops[0]).not.toHaveBeenCalled();
    await advance(1400); // minimum visible time
    await advance(1000); // fade
    expect(screen.queryByTestId("splash-beat", { hidden: true })).toBeNull();
    expect(stops[0]).toHaveBeenCalled();
    loopSpy.mockRestore();
  });
});
