import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import { isOn, turnOff, turnOn } from "./control";

/** The Settings switch for new-chapter notifications. `on` is null until the saved choice has been read. */
export function useAlertSetting() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    isOn()
      .then((v) => alive && setOn(v))
      .catch(() => alive && setOn(false));
    return () => {
      alive = false;
    };
  }, []);

  const set = useCallback(async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const result = await turnOn();
        setOn(result === "on");
        // The system will not ask again: the only way to allow notifications is its settings page.
        if (result === "denied") void Linking.openSettings().catch(() => {});
      } else {
        await turnOff();
        setOn(false);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return { on, busy, set };
}
