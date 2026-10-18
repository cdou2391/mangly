import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MOOD_FEATURE } from "@/api/types";
import { useFeature } from "@/auth/AuthContext";
import { palette } from "@/theme";

/** The way into "Pick by mood" from the Library. Shown only to accounts that have the feature. */
export function MoodEntry({ onOpen }: { onOpen: () => void }) {
  const enabled = useFeature(MOOD_FEATURE);
  if (!enabled) return null;
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel="Pick by mood. Get recommendations for how you feel." onPress={onOpen} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
        <Text style={styles.emoji}>😊</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pick by mood</Text>
          <Text style={styles.hint}>Tell us how you feel, get five titles to match.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  emoji: { fontSize: 26 },
  title: { color: palette.text, fontSize: 15.5, fontWeight: "800" },
  hint: { color: palette.muted, fontSize: 13, marginTop: 2 },
});
