import { AccessibilityInfo, Animated, StyleSheet, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { PressScale } from "../PressScale";
import { REVEAL_MS, Reveal } from "../Reveal";

// Jest has no native animation engine, so values driven natively never reach the rendered style; drive them in JS instead.
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

// In small steps, as frames come: one big jump would skip the frames in between.
const advance = async (ms: number) => {
  for (let t = 0; t < ms; t += 20) await act(async () => void jest.advanceTimersByTime(20));
};
const styleOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const lift = (id: string) => styleOf(id).transform.find((t: object) => "translateY" in t).translateY as number;
const size = (id: string) => styleOf(id).transform.find((t: object) => "scale" in t).scale as number;

describe("Reveal", () => {
  it("starts hidden and a little low, and settles into place", async () => {
    await render(
      <Reveal rise={20}>
        <Text testID="box">hi</Text>
      </Reveal>,
    );
    // the wrapper is the parent of the child
    const wrapper = () => screen.getByText("hi").parent!;
    expect(StyleSheet.flatten(wrapper().props.style).opacity).toBe(0);
    expect(StyleSheet.flatten(wrapper().props.style).transform[0].translateY).toBe(20);
    await advance(REVEAL_MS + 50);
    const done = StyleSheet.flatten(wrapper().props.style);
    expect(done.opacity).toBe(1);
    expect(done.transform[0].translateY).toBe(0);
  });

  it("starts after its delay, so blocks arrive one after another", async () => {
    await render(<Reveal delay={200}>{<Text>late</Text>}</Reveal>);
    const opacity = () => StyleSheet.flatten(screen.getByText("late").parent!.props.style).opacity as number;
    await advance(150);
    expect(opacity()).toBe(0);
    await advance(100 + REVEAL_MS / 2);
    expect(opacity()).toBeGreaterThan(0);
    expect(opacity()).toBeLessThan(1);
    await advance(REVEAL_MS);
    expect(opacity()).toBe(1);
  });

  it("can grow into place instead of rising", async () => {
    await render(<Reveal scale={0.9}>{<Text>big</Text>}</Reveal>);
    const t = () => StyleSheet.flatten(screen.getByText("big").parent!.props.style).transform;
    expect(t()[0].scale).toBeCloseTo(0.9);
    expect(t()[0].translateY).toBeUndefined();
    await advance(REVEAL_MS + 50);
    expect(t()[0].scale).toBe(1);
  });

  it("keeps still, fully shown, when the phone is set to reduce motion", async () => {
    reduce = true;
    await render(<Reveal>{<Text>still</Text>}</Reveal>);
    await advance(60);
    const flat = StyleSheet.flatten(screen.getByText("still").parent!.props.style);
    expect(flat.opacity).toBe(1);
    expect(flat.transform[0].translateY).toBe(0);
  });

  it("stops its animation when it goes away part-way", async () => {
    const stops: jest.SpyInstance[] = [];
    const realTiming = Animated.timing;
    jest.spyOn(Animated, "timing").mockImplementation((value, cfg) => {
      const anim = realTiming(value, cfg);
      stops.push(jest.spyOn(anim, "stop"));
      return anim;
    });
    const { unmount } = await render(<Reveal>{<Text>x</Text>}</Reveal>);
    await advance(100);
    await unmount();
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every((s) => s.mock.calls.length > 0)).toBe(true);
  });

  it("passes its style on to the block", async () => {
    await render(<Reveal style={{ gap: 20 }}>{<Text>x</Text>}</Reveal>);
    expect(StyleSheet.flatten(screen.getByText("x").parent!.props.style).gap).toBe(20);
  });
});

describe("PressScale", () => {
  const scale = () => StyleSheet.flatten(screen.getByRole("button").parent!.props.style).transform[0].scale as number;

  it("is a button like any other, and still calls what it is given", async () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    await render(
      <PressScale accessibilityRole="button" accessibilityLabel="Open it" onPress={onPress} onPressIn={onPressIn}>
        <Text>card</Text>
      </PressScale>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Open it" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByRole("button"), "pressIn");
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  it("sinks under the finger and springs back", async () => {
    await render(
      <PressScale accessibilityRole="button">
        <Text>card</Text>
      </PressScale>,
    );
    expect(scale()).toBe(1);
    await fireEvent(screen.getByRole("button"), "pressIn");
    await advance(200);
    expect(scale()).toBeCloseTo(0.97);
    await fireEvent(screen.getByRole("button"), "pressOut");
    await advance(300);
    expect(scale()).toBe(1);
  });

  it("does not move when the phone is set to reduce motion", async () => {
    reduce = true;
    await render(
      <PressScale accessibilityRole="button">
        <Text>card</Text>
      </PressScale>,
    );
    await advance(60);
    await fireEvent(screen.getByRole("button"), "pressIn");
    await advance(200);
    expect(scale()).toBe(1);
  });
});

describe("following the phone's setting while open", () => {
  it("stops moving when reduce motion is switched on, and starts again when it is switched off", async () => {
    let listener: (on: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_type: string, fn: (on: boolean) => void) => {
      listener = fn;
      return { remove: jest.fn() };
    }) as never);
    await render(
      <PressScale accessibilityRole="button">
        <Text>card</Text>
      </PressScale>,
    );
    const scale = () => StyleSheet.flatten(screen.getByRole("button").parent!.props.style).transform[0].scale as number;
    await act(async () => listener(true));
    await fireEvent(screen.getByRole("button"), "pressIn");
    await advance(200);
    expect(scale()).toBe(1);
    await fireEvent(screen.getByRole("button"), "pressOut");
    await act(async () => listener(false));
    await fireEvent(screen.getByRole("button"), "pressIn");
    await advance(200);
    expect(scale()).toBeCloseTo(0.97);
  });
});

describe("useReduceMotion", () => {
  it("lets go of the phone's setting when the screen goes away", async () => {
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((() => ({ remove })) as never);
    const { unmount } = await render(<PressScale accessibilityRole="button" />);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
