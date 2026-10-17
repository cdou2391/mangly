import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Page } from "@/utils/libraryView";
import { palette } from "@/theme";

/** Previous / next under the list, with where you are ("11 to 20 of 37"). Renders nothing when everything fits on one page. */
export function Pager({ page, onPage }: { page: Page<unknown>; onPage: (page: number) => void }) {
  if (page.pages <= 1) return null;
  const first = page.page <= 1;
  const last = page.page >= page.pages;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous page"
        accessibilityState={{ disabled: first }}
        disabled={first}
        onPress={() => onPage(page.page - 1)}
        style={[styles.button, first && styles.off]}
      >
        <Ionicons name="chevron-back" size={20} color={first ? palette.faint : palette.text} />
      </Pressable>
      <View style={styles.middle} accessible accessibilityLabel={`Page ${page.page} of ${page.pages}. Titles ${page.from} to ${page.to} of ${page.total}.`}>
        <Text style={styles.page}>
          Page {page.page} of {page.pages}
        </Text>
        <Text style={styles.range}>
          {page.from}–{page.to} of {page.total}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next page"
        accessibilityState={{ disabled: last }}
        disabled={last}
        onPress={() => onPage(page.page + 1)}
        style={[styles.button, last && styles.off]}
      >
        <Ionicons name="chevron-forward" size={20} color={last ? palette.faint : palette.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 },
  button: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  off: { opacity: 0.45 },
  middle: { alignItems: "center" },
  page: { color: palette.text, fontSize: 15, fontWeight: "800" },
  range: { color: palette.muted, fontSize: 12.5, marginTop: 2 },
});
