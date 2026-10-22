import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** True when the phone's setting asks apps to keep still ("Remove animations"). Starts false until the phone has answered. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((on) => alive && setReduce(!!on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (on) => setReduce(!!on));
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
