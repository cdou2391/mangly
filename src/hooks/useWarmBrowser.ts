import { useEffect } from "react";
import { warmUpBrowser } from "@/utils/browser";

/** Gets the browser ready while a screen that opens links is showing; `url` is the page most likely to be opened next. */
export function useWarmBrowser(url?: string | null) {
  useEffect(() => {
    void warmUpBrowser(url);
  }, [url]);
}
