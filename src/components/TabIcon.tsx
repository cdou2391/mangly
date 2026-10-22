import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type ColorValue } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { palette } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * A tab's icon. The selected tab shows the filled icon and a red bar at the top edge of the tab bar. When a tab becomes
 * selected the icon pops (a small spring from a smaller size) and the bar grows out from its middle, so the bar and icon
 * visibly arrive at the new tab. Stays still when the phone is set to reduce motion.
 */
export function TabIcon({ focused, color, names }: { focused: boolean; color: ColorValue; names: [filled: IconName, outline: IconName] }) {
  const reduce = useReduceMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const bar = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const first = useRef(true);

  useEffect(() => {
    // A tab that is selected when the bar first appears is simply there; only a change of tab animates.
    const initial = first.current;
    first.current = false;
    if (reduce || initial) {
      bar.setValue(focused ? 1 : 0);
      pop.setValue(1);
      return;
    }
    if (!focused) {
      bar.setValue(0);
      pop.setValue(1);
      return;
    }
    pop.setValue(0.72);
    const run = Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.timing(bar, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [focused, reduce, pop, bar]);

  return (
    <View style={styles.iconBox}>
      {focused ? <Animated.View testID="tab-indicator" style={[styles.indicator, { opacity: bar, transform: [{ scaleX: bar.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }]} /> : null}
      <Animated.View testID="tab-icon" style={{ transform: [{ scale: pop }] }}>
        <Ionicons name={names[focused ? 0 : 1]} size={24} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { alignItems: "center", justifyContent: "center" },
  // A red bar at the top edge of the active tab, with a glow where the platform supports one.
  indicator: { position: "absolute", top: -11, width: 30, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: palette.primary, shadowColor: palette.primary, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
});
