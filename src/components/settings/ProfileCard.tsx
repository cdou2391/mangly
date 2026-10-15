import { StyleSheet, Text, View } from "react-native";
import { initials, memberSince } from "@/utils/profile";
import { palette } from "@/theme";

/** Who is signed in: initials in a red ring, name, email, and when they joined. */
export function ProfileCard({ name, email, isAdmin, createdAt }: { name: string; email: string; isAdmin: boolean; createdAt: string }) {
  const since = memberSince(createdAt);
  return (
    <View style={styles.card} accessible accessibilityLabel={[name, email, isAdmin ? "Administrator" : null, since ? `Member since ${since}` : null].filter(Boolean).join(". ")}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials(name)}</Text>
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.email}>
          {email}
        </Text>
        <View style={styles.meta}>
          {isAdmin ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ADMIN</Text>
            </View>
          ) : null}
          {since ? <Text style={styles.since}>Member since {since}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: palette.primary, backgroundColor: "rgba(255,42,42,0.1)" },
  initials: { color: palette.text, fontSize: 22, fontWeight: "800", letterSpacing: 0.5 },
  text: { flex: 1, minWidth: 0 },
  name: { color: palette.text, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  email: { color: palette.muted, fontSize: 13.5, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  badge: { backgroundColor: palette.primary, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  since: { color: palette.faint, fontSize: 12.5 },
});
