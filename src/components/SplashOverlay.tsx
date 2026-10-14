import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

// Android 12+ only lets the native splash show a small icon on a flat colour, so the artwork is drawn
// here instead: the native splash stays up (plain dark) until this image has loaded, then hands over.
const ART = require("../../assets/splash-art.jpg");

const MIN_VISIBLE_MS = 1400; // long enough to register the artwork, short enough not to feel slow
const FADE_MS = 450;
const NATIVE_HIDE_FALLBACK_MS = 2500; // never leave the native splash up if the image fails to load

export function SplashOverlay({ appReady }: { appReady: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [minElapsed, setMinElapsed] = useState(false);
  const [gone, setGone] = useState(false);
  const nativeHidden = useRef(false);

  const hideNative = () => {
    if (nativeHidden.current) return;
    nativeHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const fallback = setTimeout(hideNative, NATIVE_HIDE_FALLBACK_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (!appReady || !minElapsed) return;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
      setGone(true),
    );
  }, [appReady, minElapsed, opacity]);

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, { opacity }]}>
      <StatusBar style="light" />
      <Image
        source={ART}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        onLoad={hideNative}
        onError={hideNative}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#050505", zIndex: 1000, elevation: 1000 },
});
