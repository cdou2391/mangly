import { AccessibilityInfo, Animated, StyleSheet } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { TabIcon } from "../TabIcon";

let reduce = false;
beforeEach(() => {
  jest.useFakeTimers();
  reduce = false;
  const helper = require("react-native/src/private/animated/NativeAnimatedHelper").default;
  jest.spyOn(helper, "shouldUseNativeDriver").mockReturnValue(false);
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(async () => reduce);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});
const advance = async (ms: number) => {
  for (let t = 0; t < ms; t += 20) await act(async () => void jest.advanceTimersByTime(20));
};
const names: ["library", "library-outline"] = ["library", "library-outline"];
const icon = (focused: boolean) => <TabIcon focused={focused} color="#fff" names={names} />;
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const scaleOf = () => flat("tab-icon").transform[0].scale as number;

it("shows the red bar only on the selected tab, and is already in place when the bar first appears", async () => {
  const { rerender } = await render(icon(true));
  await advance(60);
  expect(flat("tab-indicator").opacity).toBe(1);
  expect(scaleOf()).toBe(1);
  await rerender(icon(false));
  expect(screen.queryByTestId("tab-indicator")).toBeNull();
});

it("pops the icon and grows the bar out when a tab becomes selected", async () => {
  const { rerender } = await render(icon(false));
  await advance(60);
  await rerender(icon(true));
  expect(flat("tab-indicator").opacity).toBe(0); // starts from nothing
  expect(flat("tab-indicator").transform[0].scaleX).toBeLessThan(0.5); // and narrow
  expect(scaleOf()).toBeLessThan(1); // starts small
  const seen: number[] = [];
  for (let i = 0; i < 20; i++) {
    await advance(40);
    seen.push(scaleOf());
  }
  expect(Math.max(...seen)).toBeGreaterThan(0.9); // springs up to full size
  expect(flat("tab-indicator").opacity).toBe(1);
  expect(scaleOf()).toBeCloseTo(1, 1);
});

it("does not animate when a tab is deselected", async () => {
  const { rerender } = await render(icon(true));
  await advance(60);
  await rerender(icon(false));
  expect(scaleOf()).toBe(1);
});

it("stays still, with the bar fully shown, when the phone is set to reduce motion", async () => {
  reduce = true;
  const { rerender } = await render(icon(false));
  await advance(60);
  await rerender(icon(true));
  await advance(60);
  expect(scaleOf()).toBe(1);
  expect(flat("tab-indicator").opacity).toBe(1);
});

it("stops its animation when the tab bar goes away part-way", async () => {
  const stops: jest.SpyInstance[] = [];
  const realParallel = Animated.parallel;
  jest.spyOn(Animated, "parallel").mockImplementation((anims, cfg) => {
    const run = realParallel(anims, cfg);
    stops.push(jest.spyOn(run, "stop"));
    return run;
  });
  const { rerender, unmount } = await render(icon(false));
  await advance(60);
  await rerender(icon(true));
  await advance(40);
  await unmount();
  expect(stops.length).toBeGreaterThan(0);
  expect(stops.every((s) => s.mock.calls.length > 0)).toBe(true);
});
