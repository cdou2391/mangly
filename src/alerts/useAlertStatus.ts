import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { readState, type AlertsState } from "./state";

/**
 * What the background check has recorded (when it last ran, how it went, how late alerts are). It is written while the app
 * is closed, so it is read again whenever the app comes to the front; a screen can also ask with `refresh`, for example when
 * it is shown. `state` is null until the first read.
 */
export function useAlertStatus() {
  const [state, setState] = useState<AlertsState | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await readState());
    } catch {
      // keep what was shown
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { state, refresh };
}
