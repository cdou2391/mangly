import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";
import { auth } from "./authTheme";
import { scrollDeltaForKeyboard } from "./keyboardMath";

const BACKGROUND = require("../../../assets/login-bg.jpg");

// With the keyboard closed the artwork shows at the top and fades out below the logo. With it open the
// logo and form move up over the bright part of the artwork, so the whole top needs shading to stay readable.
const SCRIM = {
  colors: ["rgba(5,5,5,0)", "rgba(5,5,5,0.72)", "rgba(5,5,5,0.95)", "rgba(5,5,5,0.88)"] as const,
  locations: [0.14, 0.34, 0.5, 1] as const,
};
const SCRIM_OPEN = {
  colors: ["rgba(5,5,5,0.7)", "rgba(5,5,5,0.9)", "rgba(5,5,5,0.95)", "rgba(5,5,5,0.9)"] as const,
  locations: [0, 0.2, 0.4, 1] as const,
};

interface AuthLayout {
  keyboardHeight: number;
  /** Scroll the currently focused field above the keyboard. Safe to call at any time. */
  ensureFocusedVisible: () => void;
}
const AuthLayoutContext = createContext<AuthLayout>({ keyboardHeight: 0, ensureFocusedVisible: () => {} });
export const useAuthLayout = () => useContext(AuthLayoutContext);

/**
 * Full-screen artwork with a scrim that fades it out below the logo so the form stays readable.
 *
 * Layout: header (logo) / form / footer. With the keyboard closed the header takes the spare room and the
 * form sits a little above centre. With it open the header collapses to the top, the footer disappears,
 * space is reserved under the content, and the focused field is scrolled clear of the keyboard.
 */
export function AuthScreen({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const open = keyboardHeight > 0;

  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const latest = useRef({ keyboardHeight, windowHeight });
  latest.current = { keyboardHeight, windowHeight };

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ensureFocusedVisible = useCallback(() => {
    // Debounced: focus changes and keyboard events often arrive together.
    clearTimeout(timer.current);
    // Wait for the keyboard and the collapsing header to finish laying out before measuring.
    timer.current = setTimeout(() => {
      const input = TextInput.State?.currentlyFocusedInput?.();
      input?.measureInWindow((_x, y, _w, h) => {
        const delta = scrollDeltaForKeyboard({ fieldBottom: y + h, ...latest.current });
        if (delta > 0) scrollRef.current?.scrollTo({ y: offset.current + delta, animated: true });
      });
    }, 160);
  }, []);

  // A pending measurement must not outlive the screen (the user may navigate away right after tapping a field).
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (open) ensureFocusedVisible();
  }, [open, keyboardHeight, ensureFocusedVisible]);

  const layout = useMemo(() => ({ keyboardHeight, ensureFocusedVisible }), [keyboardHeight, ensureFocusedVisible]);

  return (
    <AuthLayoutContext.Provider value={layout}>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Image
          source={BACKGROUND}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <LinearGradient
          pointerEvents="none"
          colors={open ? SCRIM_OPEN.colors : SCRIM.colors}
          locations={open ? SCRIM_OPEN.locations : SCRIM.locations}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          testID="auth-scroll"
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            offset.current = e.nativeEvent.contentOffset.y;
          }}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: (open ? keyboardHeight : insets.bottom) + 16 },
          ]}
        >
          <View style={open ? styles.headerOpen : styles.header}>{header}</View>
          <View>{children}</View>
          {open ? null : (
            <>
              <View style={styles.spacer} />
              {footer}
            </>
          )}
        </ScrollView>
      </View>
    </AuthLayoutContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: auth.bg },
  content: { flexGrow: 1, paddingHorizontal: 28 },
  // Takes the spare room above the form, and `spacer` takes some below it, which lifts the form above centre.
  header: { flex: 1, justifyContent: "center", minHeight: 210, paddingVertical: 8 },
  headerOpen: { alignItems: "center", paddingTop: 4, paddingBottom: 18 },
  spacer: { flex: 0.5 },
});
