import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/api/endpoints";
import type { AppNotification } from "@/api/types";
import { failToast } from "./useMarkChapterRead";

/**
 * "Clear read": deletes the alerts that have been read from the history. Unread alerts and reading progress are never touched,
 * and the newest chapter of each title still shows in the feed (it comes from the titles, not from the alerts). The alerts
 * disappear at once and come back if deleting fails, with the usual message.
 */
export function useClearReadAlerts() {
  const qc = useQueryClient();

  return useMutation<unknown, Error, void, { previous: AppNotification[] | undefined }>({
    mutationFn: () => notificationsApi.clearRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const previous = qc.getQueryData<AppNotification[]>(["notifications"]);
      qc.setQueryData<AppNotification[]>(["notifications"], (list) => list?.filter((n) => !n.is_read));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(["notifications"], context.previous);
      failToast("Couldn't clear your read alerts. Check your connection and try again later.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
