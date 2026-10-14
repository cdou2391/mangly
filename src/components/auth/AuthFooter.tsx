import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { auth } from "./authTheme";

const PULSE = require("../../../assets/pulse.png");
const WORDS = ["READ", "DISCOVER", "FEEL", "BELONG"];

export function OrDivider() {
  return (
    <View style={styles.or}>
      <View style={styles.line} />
      <Text style={styles.orText}>OR</Text>
      <View style={styles.line} />
    </View>
  );
}

export function AuthFooter() {
  const { width } = useWindowDimensions();
  const tight = width < 360; // keep the four words on one line on narrow phones
  return (
    <View style={styles.footer}>
      <View style={styles.words}>
        {WORDS.map((w, i) => (
          <View key={w} style={styles.item}>
            {i > 0 ? <Text style={[styles.dot, tight && styles.dotTight]}>•</Text> : null}
            <Text style={[styles.word, tight && styles.wordTight]}>{w}</Text>
          </View>
        ))}
      </View>
      <Image source={PULSE} style={styles.pulse} contentFit="contain" accessibilityElementsHidden />
    </View>
  );
}

const styles = StyleSheet.create({
  or: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.28)" },
  orText: { color: auth.muted, fontSize: 15, marginHorizontal: 16 },
  footer: { alignItems: "center", marginTop: 26 },
  words: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  item: { flexDirection: "row", alignItems: "center" },
  word: { color: auth.muted, fontSize: 10.5, letterSpacing: 2.4 },
  wordTight: { fontSize: 9.5, letterSpacing: 1.4 },
  dot: { color: auth.red, fontSize: 10, marginHorizontal: 9 },
  dotTight: { marginHorizontal: 6 },
  pulse: { width: 150, height: 18, marginTop: 10 },
});
