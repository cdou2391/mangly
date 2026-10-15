import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { trackingApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { attachUser, markSeen, resume, turnOn } from "./control";
import { newestId } from "./plan";
import type { AppNotification } from "@/api/types";

// The app is Android-only; the web preview has no notification responses to read. A platform is fixed for the life of the app, so this is not a conditional hook.
const useResponse = Platform.OS === "web" ? () => null : Notifications.useLastNotificationResponse;

/**
 * Everything about new-chapter notifications that happens while the app is open and someone is signed in. Renders nothing.
 *  1. the saved state is made to belong to this user, and the background check is kept scheduled;
 *  2. the first time (once there is something in the library to be notified about) the user is asked for permission;
 *  3. alerts the app has itself loaded count as seen, so the background check does not announce them again;
 *  4. tapping a notification opens Updates.
 */
export function AlertsEffects() {
  const { state } = useAuth();
  const userId = state.status === "signedIn" ? state.user.id : null;
  const qc = useQueryClient();
  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });
  const hasTitles = (tracked.data?.length ?? 0) > 0;

  // 1 and 2
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    (async () => {
      const saved = await attachUser(userId);
      if (!alive) return;
      if (saved.enabled === null) {
        if (hasTitles) await turnOn(); // asks once; the answer (yes or no) is remembered
      } else {
        await resume();
      }
    })().catch((e) => console.warn("Could not set up notifications", e));
    return () => {
      alive = false;
    };
  }, [userId, hasTitles]);

  // 3: only answers that came from the server (not the saved copy or an optimistic edit) say what the user has seen.
  useEffect(() => {
    if (userId === null) return;
    const seen = (list: unknown) => {
      if (Array.isArray(list) && list.length > 0) void markSeen(userId, newestId(list as AppNotification[])).catch(() => {});
    };
    return qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success" && !event.action.manual && event.query.queryKey[0] === "notifications") {
        seen(event.query.state.data);
      }
    });
  }, [qc, userId]);

  // 4
  const response = useResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response || userId === null) return;
    const id = `${response.notification.request.identifier}@${response.notification.date}`;
    if (handled.current === id) return;
    handled.current = id;
    if (response.notification.request.content.data?.screen === "updates") router.navigate("/updates");
  }, [response, userId]);

  return null;
}
