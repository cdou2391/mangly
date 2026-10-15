import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { palette } from "@/theme";

const LOGO = require("../../assets/logo.png");

/** A cover image, with the logo on a dark tile when the title has none (or it fails to load). */
export function Cover({ uri, style }: { uri?: string | null; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, style]}>
      <Image source={LOGO} style={styles.fallback} contentFit="contain" />
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          recyclingKey={uri}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: palette.raised, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  fallback: { width: "55%", height: "55%", opacity: 0.35 },
});
