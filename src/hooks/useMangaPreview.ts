import { useQuery } from "@tanstack/react-query";
import { mangaApi } from "@/api/endpoints";
import type { SearchCandidate } from "@/api/types";

/**
 * What a source site says about a search result right now. The server scrapes the site for it and allows 30 a minute, so an
 * answer is kept for ten minutes (opening the same preview again costs nothing) and a failure is not retried behind the
 * reader's back: they can retry from the sheet.
 */
export function useMangaPreview(candidate: SearchCandidate | null) {
  return useQuery({
    queryKey: ["manga-preview", candidate?.source, candidate?.url],
    queryFn: () => mangaApi.details(candidate!.url, candidate!.source),
    enabled: candidate !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
