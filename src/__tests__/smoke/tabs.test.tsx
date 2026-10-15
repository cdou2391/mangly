/**
 * Navigation smoke test: the tab bar after Updates and Alerts were merged. Alerts is gone, and the Updates tab carries
 * the number of unread chapters (the Library's bell and the Updates tab read the same feed).
 */
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as h from "@/test-utils/smoke";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-splash-screen", () => require("@/test-utils/mocks").splashMock());
jest.mock("@/push/register", () => require("@/test-utils/mocks").pushMock());

beforeEach(() => h.resetClientState());

const NOW = new Date().toISOString();
const mk = (id: number, name: string) => ({
  id: id * 10, user_id: 1, manga_id: id, preferred_source_record_id: null, last_chapter_read: "1", last_chapter_url: null, reading_status: "reading",
  user_status_override: null, notifications_enabled: true, rating: null, created_at: NOW, updated_at: NOW, preferred_source_record: null,
  manga: { id, canonical_name: name, genres: null, author: null, summary: null, cover_url: null, latest_chapter: "5", latest_chapter_url: null, global_status: "ongoing", created_at: NOW, updated_at: NOW },
});
const chapter = (id: number, name: string) => ({
  tracking_id: id * 10, manga_id: id, manga_title: name, manga_cover_url: null, chapter: "5", chapter_url: null, chapter_at: NOW, source: "mangaread", is_new: true,
});

it("has no Alerts tab, and badges Updates with the unread chapters", async () => {
  h.store["mangly.refresh_token"] = "mpr_old";
  h.routeFetch({
    "/auth/mobile/refresh": () => h.json(200, h.pair),
    "/tracked-manga/recent-chapters": () => h.json(200, [chapter(1, "Chainsaw Man"), chapter(2, "Dandadan")]),
    "/tracked-manga": () => h.json(200, [mk(1, "Chainsaw Man"), mk(2, "Dandadan"), mk(3, "One Piece")]),
    "/notifications": () => h.json(200, []),
  });
  renderRouter("./src/app", { initialUrl: "/" });
  await waitFor(() => expect(screen.getAllByText("Library").length).toBeGreaterThan(0), { timeout: 5000 });
  expect(screen.queryByText("Alerts")).toBeNull();
  expect(screen.getByText("Updates")).toBeTruthy();
  expect(screen.getByText("Search")).toBeTruthy();
  expect(screen.getByText("Settings")).toBeTruthy();
  // three titles are tracked (so the Library chips read 3), two have something new: the only bare "2" on screen is the badge
  await waitFor(() => expect(screen.getByText("2")).toBeTruthy(), { timeout: 5000 });
});
