import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette } from "@/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * A question the reader has to answer before something is done, in the app's own style instead of the system's plain alert: a
 * card in the middle of the screen over a dimmed backdrop, the way to cancel on the left and the action on the right. A tap on the
 * backdrop, or the Back button, cancels, so only the action button does the thing. `children` is shown under the title (for
 * instance, which title is about to be removed). `destructive` draws the action in the alert colour.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  icon = "help-circle-outline",
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  message: string;
  icon?: IconName;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const tone = destructive ? palette.danger : palette.primary;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable accessibilityLabel={`Dismiss: ${title}`} style={styles.backdrop} onPress={onCancel}>
        {/* A tap on the card itself must not fall through to the backdrop and cancel. */}
        <Pressable testID="confirm-dialog" accessible={false} onPress={() => undefined} style={styles.card} accessibilityViewIsModal>
          <View style={[styles.badge, { backgroundColor: destructive ? "rgba(255,90,90,0.12)" : "rgba(255,42,42,0.12)", borderColor: destructive ? "rgba(255,90,90,0.35)" : palette.primaryDeep }]}>
            <Ionicons name={icon} size={26} color={tone} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {children}
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={cancelLabel} onPress={onCancel} style={({ pressed }) => [styles.button, styles.cancel, pressed && { opacity: 0.8 }]}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={({ pressed }) => [styles.button, { backgroundColor: destructive ? "#D93636" : palette.primary }, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 22, backgroundColor: palette.card, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 22, alignItems: "center", gap: 12 },
  badge: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  title: { color: palette.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" },
  message: { color: palette.muted, fontSize: 14.5, lineHeight: 21, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 8 },
  button: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cancel: { borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(255,255,255,0.04)" },
  cancelText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  confirmText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
