import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from "react-native";

/**
 * Height of the on-screen keyboard (0 when hidden).
 *
 * Needed because the app is edge-to-edge: Android no longer shrinks the window for `adjustResize`,
 * so the keyboard is drawn over the screen and layouts must move out of its way themselves.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e: KeyboardEvent) => {
      animate();
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
      animate();
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
