import { AccessibilityInfo, Animated, Dimensions, StyleSheet } from "react-native";
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

describe("the name", () => {
  const style = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { hidden: true }).props.style);
  const window = () => Dimensions.get("window");
  /** Where the M itself starts: the picture of the mark has empty space above the M (74 of its 640 pixels). */
  const mTop = () => {
    const logo = style("splash-logo");
    return window().height / 2 - logo.height / 2 + logo.height * (74 / 640);
  };
  const withScreen = (width: number, height: number) =>
    jest.spyOn(Dimensions, "get").mockReturnValue({ width, height, scale: 2, fontScale: 1 });
  afterEach(() => jest.restoreAllMocks());

  it("is the stylised MangaPulse wordmark, called MangaPulse for a screen reader", async () => {
    await render(<SplashOverlay appReady={false} />);
    const name = screen.getByTestId("splash-wordmark", { hidden: true });
    expect(name.props.accessibilityLabel).toBe("MangaPulse");
    expect(name.props.source).not.toBe(screen.getByTestId("splash-logo", { hidden: true }).props.source); // its own picture, not the mark
  });

  it("sits above the M, close to it, and does not cover it", async () => {
    await render(<SplashOverlay appReady={false} />);
    const name = style("splash-wordmark");
    const bottom = name.top + name.height;
    expect(bottom).toBeLessThanOrEqual(mTop());
    expect(mTop() - bottom).toBeLessThan(30); // near the M, not floating at the top of the screen
  });

  it("is centred across the screen and keeps the shape of the picture", async () => {
    await render(<SplashOverlay appReady={false} />);
    const name = style("splash-wordmark");
    expect(name.left + name.width / 2).toBeCloseTo(window().width / 2, 1);
    expect(name.width / name.height).toBeCloseTo(1000 / 306, 2);
  });

  it("is no wider than 78% of the screen or 340 points", async () => {
    await render(<SplashOverlay appReady={false} />);
    expect(style("splash-wordmark").width).toBeLessThanOrEqual(Math.min(window().width * 0.78, 340));
    expect(style("splash-wordmark").width).toBeGreaterThan(300); // and still big enough to read
  });

  it.each([
    [360, 640],
    [412, 915],
    [320, 568],
    [800, 1280],
  ])("stays fully on a %d by %d screen", async (width, height) => {
    withScreen(width, height);
    await render(<SplashOverlay appReady={false} />);
    const name = style("splash-wordmark");
    expect(name.top).toBeGreaterThanOrEqual(0);
    expect(name.left).toBeGreaterThanOrEqual(0);
    expect(name.left + name.width).toBeLessThanOrEqual(width);
    expect(name.top + name.height).toBeLessThanOrEqual(mTop());
  });

  it("does not beat with the M: it stays the same size", async () => {
    await render(<SplashOverlay appReady={false} />);
    expect(style("splash-wordmark").transform).toBeUndefined();
    const before = style("splash-wordmark").width;
    await advance(400);
    expect(style("splash-wordmark").width).toBe(before);
  });

  it("goes with the splash when it fades away", async () => {
    await render(<SplashOverlay appReady />);
    expect(screen.getByTestId("splash-wordmark", { hidden: true })).toBeTruthy();
    await advance(1400);
    await advance(1000);
    expect(screen.queryByTestId("splash-wordmark", { hidden: true })).toBeNull();
  });
});

