import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { readHistory, type AlertRecord } from "@/alerts/history";
import { formatWhen, lateBy } from "@/alerts/status";
import { BackBar } from "@/components/detail/BackBar";
import { Screen } from "@/components/ui";
import { shortChapter } from "@/utils/chapters";
import { palette } from "@/theme";

/** The chapters this phone last told the reader about: when MangaPulse found each one and when the notification was shown. */
export default function AlertHistory() {
  const [records, setRecords] = useState<AlertRecord[] | null>(null);
  useEffect(() => {
    void readHistory().then((r) => setRecords([...r].reverse()));
  }, []);
  const now = Date.now();

  return (
    <Screen padded={false}>
      <BackBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={styles.title}>
          Recent alerts
        </Text>
        <Text style={styles.intro}>
          <Text style={styles.strong}>Found</Text> is when MangaPulse added the chapter. <Text style={styles.strong}>Notified</Text> is when this phone showed the notification. The site may have posted the chapter a little before MangaPulse found it.
        </Text>
        {records === null ? null : records.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={44} color={palette.faint} />
            <Text style={styles.emptyTitle}>No alerts yet</Text>
            <Text style={styles.emptyHint}>Notifications shown while the app is closed are listed here, newest first. The last 10 are kept.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {records.map((r) => {
              const chapter = shortChapter(r.chapter) ?? r.chapter;
              const found = formatWhen(r.found, now);
              const sent = formatWhen(r.sent, now);
              const late = lateBy(r.found, r.sent);
              return (
                <View key={r.id} accessible accessibilityLabel={`${r.title}, ${chapter}. Found ${found}. Notified ${sent}, ${late}.`} style={styles.card}>
                  <View style={styles.head}>
                    <Text numberOfLines={1} style={styles.name}>
                      {r.title}
                    </Text>
                    <Text style={styles.chapter}>{chapter}</Text>
                  </View>
                  <Line label="Found" value={found} />
                  <Line label="Notified" value={sent} note={late} />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 16 },
  title: { color: palette.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  intro: { color: palette.muted, fontSize: 13.5, lineHeight: 20 },
  strong: { color: palette.text, fontWeight: "700" },
  list: { gap: 10 },
  card: { borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", padding: 14, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  name: { flex: 1, color: palette.text, fontSize: 15.5, fontWeight: "800" },
  chapter: { color: palette.primary, fontSize: 14, fontWeight: "800" },
  line: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  label: { width: 68, color: palette.muted, fontSize: 13 },
  value: { color: "#D7D7DA", fontSize: 14, fontWeight: "600" },
  note: { color: palette.muted, fontSize: 12.5 },
  empty: { alignItems: "center", gap: 10, paddingTop: 50 },
  emptyTitle: { color: palette.text, fontSize: 18, fontWeight: "800" },
  emptyHint: { color: palette.muted, textAlign: "center", lineHeight: 20 },
});
