import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette } from "@/theme";

export const MAX_RATING = 5;

/** What the rating says in words, for under the stars and for a screen reader. */
export const ratingText = (value: number | null) => (value === null ? "Not rated yet" : `${value} out of ${MAX_RATING}`);

/**
 * Your rating of a title: five stars to tap (tap another to change it), and "Clear rating" to take it back. `onRate`
 * and `onClear` only report the tap; the caller saves it.
 */
export function RatingStars({
  value,
  busy = false,
  onRate,
  onClear,
}: {
  value: number | null;
  busy?: boolean;
  onRate: (rating: number) => void;
  onClear: () => void;
}) {
  return (
    <View>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={`Your rating. ${ratingText(value)}.`}>
        {Array.from({ length: MAX_RATING }, (_, i) => i + 1).map((n) => {
          const on = value !== null && n <= value;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={`Rate ${n} ${n === 1 ? "star" : "stars"}`}
              accessibilityState={{ selected: n === value, checked: n === value, disabled: busy }}
              disabled={busy}
              hitSlop={4}
              onPress={() => onRate(n)}
              style={({ pressed }) => [styles.star, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name={on ? "star" : "star-outline"} size={36} color={on ? palette.primary : palette.faint} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.foot}>
        <Text style={styles.text}>{ratingText(value)}</Text>
        {value !== null ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear rating" accessibilityState={{ disabled: busy }} disabled={busy} hitSlop={10} onPress={onClear}>
            <Text style={[styles.clear, busy && { opacity: 0.5 }]}>Clear rating</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: "row", gap: 6 },
  star: { padding: 2 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  text: { color: palette.muted, fontSize: 14 },
  clear: { color: palette.primary, fontSize: 14, fontWeight: "700" },
});
