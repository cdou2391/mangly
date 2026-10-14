import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { spacing, useTheme } from "@/theme";

export function MangaRow({
  title,
  subtitle,
  coverUrl,
  badge,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  badge?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={[s.row, { backgroundColor: t.card, borderColor: t.border }]}
    >
      <Image
        source={coverUrl ? { uri: coverUrl } : undefined}
        style={[s.cover, { backgroundColor: t.border }]}
        contentFit="cover"
        recyclingKey={coverUrl ?? undefined}
      />
      <View style={s.body}>
        <Text numberOfLines={2} style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: t.muted, fontSize: 13 }}>
            {subtitle}
          </Text>
        ) : null}
        {badge ? (
          <Text style={{ color: t.primary, fontSize: 12, fontWeight: "600" }}>{badge}</Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  cover: { width: 52, height: 72, borderRadius: 8 },
  body: { flex: 1, gap: 2 },
});
