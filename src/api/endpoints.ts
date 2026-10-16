import { api, applySession, dropSession } from "./client";
import { tokenStore } from "@/auth/tokenStore";
import type {
  AppNotification,
  HomePick,
  RecentChapter,
  RegisterRequest,
  SearchCandidate,
  TokenPair,
  TrackedManga,
  TrackedMangaUpdate,
  TrackFromSourceRequest,
  TrackingStats,
  User,
} from "./types";

export const authApi = {
  async login(email: string, password: string, deviceName?: string) {
    const pair = await api.post<TokenPair>(
      "/auth/mobile/login",
      { email, password, device_name: deviceName },
      { auth: false },
    );
    await applySession(pair);
    return pair.user;
  },
  register: (body: RegisterRequest) => api.post<User>("/auth/register", body, { auth: false }),
  me: () => api.get<User>("/auth/me"),
  async logout() {
    const refresh = await tokenStore.getRefreshToken();
    try {
      // Authenticated by the refresh token itself, so it works with an expired access token and
      // must not trigger a refresh (which would rotate the very token being revoked).
      if (refresh) await api.post("/auth/mobile/logout", { refresh_token: refresh }, { auth: false });
    } finally {
      await dropSession();
    }
  },
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }, { auth: false }),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/auth/change-password", { current_password, new_password }),
};

export const trackingApi = {
  list: () => api.get<TrackedManga[]>("/tracked-manga"),
  stats: () => api.get<TrackingStats>("/tracked-manga/stats"),
  recentChapters: () => api.get<RecentChapter[]>("/tracked-manga/recent-chapters"),
  track: (manga_id: number) => api.post<TrackedManga>("/tracked-manga", { manga_id }),
  fromSource: (body: TrackFromSourceRequest) => api.post<TrackedManga>("/tracked-manga/from-source", body),
  update: (id: number, body: TrackedMangaUpdate) => api.patch<TrackedManga>(`/tracked-manga/${id}`, body),
  remove: (id: number) => api.delete<void>(`/tracked-manga/${id}`),
};

export const mangaApi = {
  search: (q: string, source = "all") =>
    api.get<SearchCandidate[]>(`/manga/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`),
  homePicks: (limit = 8) => api.get<HomePick[]>(`/manga/home-picks?limit=${limit}`),
};

export const notificationsApi = {
  list: (opts?: { unreadOnly?: boolean }) =>
    api.get<AppNotification[]>(opts?.unreadOnly ? "/notifications?unread_only=true" : "/notifications"),
  unreadCount: () => api.get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: number) => api.patch<AppNotification>(`/notifications/${id}/read`),
  markAllRead: () => api.patch<unknown>("/notifications/read-all"),
  clearRead: () => api.delete<unknown>("/notifications/read"),
};
