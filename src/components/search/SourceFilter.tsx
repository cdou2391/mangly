import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { sourceName } from "@/utils/sources";
import { palette } from "@/theme";

/** "All | MangaRead | WeebCentral": narrows the results to titles a site has. Shown only when there is a choice to make. */
export function SourceFilter({
  sources,
  value,
  onChange,
}: {
  sources: string[];
  value: string | null;
  onChange: (source: string | null) => void;
}) {
  if (sources.length < 2) return null;
  const options: (string | null)[] = [null, ...sources];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ flexGrow: 0 }}>
      {options.map((s) => {
        const on = value === s;
        const label = s ? sourceName(s) : "All sites";
        return (
          <Pressable
            key={s ?? "all"}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => onChange(s)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 20, gap: 8 },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  label: { color: "#C8C8CC", fontSize: 13, fontWeight: "700" },
  labelOn: { color: "#fff" },
});
