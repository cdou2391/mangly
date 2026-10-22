import { useRef } from "react";
import { Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useReduceMotion } from "@/hooks/useReduceMotion";

/** A Pressable that sinks a little under the finger and springs back, so a tap on a card feels like pressing it. */
export function PressScale({ pressedScale = 0.97, containerStyle, onPressIn, onPressOut, ...props }: PressableProps & { pressedScale?: number; containerStyle?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number, duration: number) => {
    if (reduce) return;
    Animated.timing(scale, { toValue: value, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          to(pressedScale, 90);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          to(1, 180);
          onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}
