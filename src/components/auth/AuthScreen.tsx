import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth } from "./authTheme";

const BACKGROUND = require("../../../assets/login-bg.jpg");

/**
 * Full-screen artwork with a scrim that fades it out below the logo so the form stays readable,
 * and a scrolling column on top (the keyboard resizes the window, so the form can always be reached).
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
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
        colors={["rgba(5,5,5,0)", "rgba(5,5,5,0.72)", "rgba(5,5,5,0.95)", "rgba(5,5,5,0.88)"]}
        locations={[0.14, 0.34, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: auth.bg },
  content: { flexGrow: 1, paddingHorizontal: 28 },
});
