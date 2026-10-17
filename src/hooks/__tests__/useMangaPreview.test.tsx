import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mangaApi } from "@/api/endpoints";
import type { SearchCandidate } from "@/api/types";
import { useMangaPreview } from "../useMangaPreview";

jest.mock("@/api/endpoints", () => ({ mangaApi: { details: jest.fn() } }));

const details = mangaApi.details as jest.Mock;
const candidate: SearchCandidate = { title: "Berserk", url: "https://x.test/berserk/", cover_url: null, author: null, status: null, alternative_titles: [], source: "mangaread" };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});

it("asks for nothing while there is no title to preview", async () => {
  const { result } = await renderHook(() => useMangaPreview(null), { wrapper });
  expect(result.current.fetchStatus).toBe("idle");
  expect(details).not.toHaveBeenCalled();
});

it("asks the site once for the title, by address and site", async () => {
  details.mockResolvedValue({ title: "Berserk" });
  const { result } = await renderHook(() => useMangaPreview(candidate), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual({ title: "Berserk" }));
  expect(details).toHaveBeenCalledTimes(1);
  expect(details).toHaveBeenCalledWith("https://x.test/berserk/", "mangaread");
});

it("does not ask again behind the reader's back when it fails", async () => {
  details.mockRejectedValue(new Error("down"));
  const { result } = await renderHook(() => useMangaPreview(candidate), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(details).toHaveBeenCalledTimes(1);
});

it("keeps an answer for ten minutes, so opening the same preview again costs nothing", async () => {
  details.mockResolvedValue({ title: "Berserk" });
  const first = await renderHook(() => useMangaPreview(candidate), { wrapper });
  await waitFor(() => expect(first.result.current.data).toBeTruthy());
  first.unmount();
  await renderHook(() => useMangaPreview(candidate), { wrapper });
  expect(details).toHaveBeenCalledTimes(1);
});
