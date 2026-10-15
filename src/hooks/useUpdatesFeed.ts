import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { notificationsApi, trackingApi } from "@/api/endpoints";
import { buildFeed } from "@/utils/feed";

/**
 * The Updates feed and its unread count, shared by the Updates screen, the tab badge and the Library bell so that they
 * can never disagree. Built from the alerts, the latest chapters and the tracked list; if one of them fails to load the
 * feed still shows what the others have, and it is only an error when there is nothing at all to show.
 */
export function useUpdatesFeed() {
  const alerts = useQuery({ queryKey: ["notifications"], queryFn: () => notificationsApi.list(), refetchInterval: 120_000 });
  const recent = useQuery({ queryKey: ["recent-chapters"], queryFn: trackingApi.recentChapters });
  const tracked = useQuery({ queryKey: ["tracked"], queryFn: trackingApi.list });

  const items = useMemo(() => buildFeed(alerts.data, recent.data, tracked.data), [alerts.data, recent.data, tracked.data]);
  const unreadCount = useMemo(() => items.filter((i) => i.unread).length, [items]);

  const queries = [alerts, recent];
  const isLoading = items.length === 0 && queries.some((q) => q.isLoading);
  const failed = queries.every((q) => q.isError);
  const error = failed ? (alerts.error ?? recent.error) : null;

  return {
    items,
    unreadCount,
    isLoading,
    error: items.length === 0 && error ? error : null,
    isRefetching: queries.some((q) => q.isRefetching),
    refetch: () => Promise.all([alerts.refetch(), recent.refetch(), tracked.refetch()]),
    /** The new chapters (past your progress), which "Mark all read" moves progress for. */
    fresh: recent.data?.filter((c) => c.is_new) ?? [],
  };
}
