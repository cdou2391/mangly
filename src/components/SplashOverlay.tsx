import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

// Android 12+ only lets the native splash show a small icon on a flat colour, so the artwork is drawn
// here instead: the native splash stays up (plain dark) until this image has loaded, then hands over.
const ART = require("../../assets/splash-art.jpg");
const MARK = require("../../assets/logo-mark.png");
const WORDMARK = require("../../assets/logo-wordmark.png");

/** The wordmark picture is 1000 by 306. */
const WORDMARK_RATIO = 1000 / 306;
/** The mark's picture has empty space above the M (74 of its 640 pixels), so the name is placed against the M, not the picture. */
const MARK_TOP_INSET = 74 / 640;
const NAME_GAP = 12; // between the name and the top of the M

const MIN_VISIBLE_MS = 1400; // long enough to register the artwork, short enough not to feel slow
const FADE_MS = 450;
const NATIVE_HIDE_FALLBACK_MS = 2500; // never leave the native splash up if the image fails to load

const RED = "#FF2A2A";
const BEAT_MS = 1500; // one "lub-dub" plus a short rest, repeated while the app loads

/**
 * The logo, centred and large, beating like a heart: a quick double thump, with a red ripple leaving the mark on each
 * thump. Runs until the splash is removed (the loop is stopped on unmount) and stays still if the user asked for less motion.
 */
function HeartbeatLogo() {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.82, height * 0.5, 380);
  // The name sits above the M, centred, and never wider than the screen allows.
  const nameWidth = Math.min(width * 0.78, 340);
  const nameHeight = nameWidth / WORDMARK_RATIO;
  const nameTop = height / 2 - size / 2 + size * MARK_TOP_INSET - nameHeight - NAME_GAP;
  const scale = useRef(new Animated.Value(1)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    const thump = (to: number, ms: number) =>
      Animated.timing(scale, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: true });
    const ripple = (v: Animated.Value, delay: number) =>
      Animated.sequence([
        // Animated.loop does not put these back to zero between beats, so without this only the first beat has a ripple.
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]);

    const start = () => {
      if (cancelled) return;
      loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            thump(1.08, 110), // lub
            thump(1, 130),
            thump(1.13, 130), // dub, a little stronger
            thump(1, 320),
            Animated.delay(BEAT_MS - 690),
          ]),
          ripple(ripple1, 0),
          ripple(ripple2, 240),
        ]),
      );
      loop.start();
    };

    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((reduce) => !reduce && start())
      .catch(start);

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [scale, ripple1, ripple2]);

  const ring = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.75] }) }],
    opacity: v.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.85, 0] }),
  });

  return (
    <View pointerEvents="none" style={styles.center}>
      <Animated.View
        testID="splash-ripple"
        style={[styles.ring, { width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4 }, ring(ripple1)]}
      />
      <Animated.View
        style={[styles.ring, { width: size * 0.8, height: size * 0.8, borderRadius: size * 0.4 }, ring(ripple2)]}
      />
      <Animated.View testID="splash-beat" style={{ transform: [{ scale }] }}>
        <Image source={MARK} testID="splash-logo" style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>
      <Image
        source={WORDMARK}
        testID="splash-wordmark"
        accessibilityLabel="MangaPulse"
        style={{ position: "absolute", top: nameTop, left: (width - nameWidth) / 2, width: nameWidth, height: nameHeight }}
        contentFit="contain"
      />
    </View>
  );
}

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
      <View style={styles.scrim} />
      <HeartbeatLogo />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#050505", zIndex: 1000, elevation: 1000 },
  // Darkens the artwork so the logo is the one thing that stands out.
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 4, borderColor: RED },
});
