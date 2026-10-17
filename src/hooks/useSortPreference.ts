import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_SORT, isSortKey, type SortKey } from "@/utils/libraryView";

const KEY = "mangly.library_sort";

/** The Library's sort order, remembered between launches. Unreadable or unknown saved values mean the default. */
export function useSortPreference() {
  const [sort, setSortState] = useState<SortKey>(DEFAULT_SORT);

  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(KEY)
      .then((saved) => {
        if (alive && isSortKey(saved)) setSortState(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setSort = useCallback((next: SortKey) => {
    setSortState(next);
    SecureStore.setItemAsync(KEY, next).catch(() => {}); // not remembering is no reason to fail
  }, []);

  return [sort, setSort] as const;
}
