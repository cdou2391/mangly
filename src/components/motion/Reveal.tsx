import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { useReduceMotion } from "@/hooks/useReduceMotion";

/** How long one block takes to settle. Short: it is there to make the screen feel alive, not to make the reader wait. */
export const REVEAL_MS = 340;

/**
 * Fades a block in as it first appears, rising a little (or growing from a slightly smaller size with `scale`), after `delay`.
 * Plays once, when it is first shown; later changes inside it do not replay it. With the phone set to reduce motion the block
 * is simply there, with no movement at all.
 */
export function Reveal({
  children,
  delay = 0,
  rise = 16,
  scale,
  style,
}: {
  children: ReactNode;
  /** Milliseconds to wait before starting, so a screen's blocks can arrive one after another. */
  delay?: number;
  /** How far below its place the block starts, in points. */
  rise?: number;
  /** Starts at this size (for instance 0.92) instead of rising. */
  scale?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const run = Animated.timing(progress, { toValue: 1, duration: REVEAL_MS, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [reduce, delay, progress]);

  const transform = scale !== undefined ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) }] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }];
  return <Animated.View style={[style, { opacity: progress, transform }]}>{children}</Animated.View>;
}
