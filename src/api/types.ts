// Mirrors the MangaPulse API schemas (backend/app/schemas). Keep in sync with docs/API_CONTRACT.md.

export type ReadingStatus = "reading" | "completed" | "on_hold" | "dropped" | "plan_to_read";
export type MangaStatus = "ongoing" | "completed" | "hiatus" | "cancelled" | "unknown";
export type MangaSource = "mangaread" | "weebcentral";

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: "user" | "admin";
  is_active: boolean;
  created_at: string;
  updated_at: string;
  features: string[];
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  /** Access token lifetime in seconds. */
  expires_in: number;
  user: User;
}

export interface Manga {
  id: number;
  canonical_name: string;
  genres: string[] | null;
  author: string | null;
  summary: string | null;
  cover_url: string | null;
  latest_chapter: string | null;
  latest_chapter_url: string | null;
  global_status: MangaStatus;
  created_at: string;
  updated_at: string;
}

/**
 * A recommendation for the home screen (GET /manga/home-picks). `id` is the manga id, which POST /tracked-manga accepts.
 * "similar" picks resemble a title in the reader's library (`because`, `reason`); "popular" ones are followed by other readers.
 */
export interface HomePick {
  kind: "similar" | "popular";
  id: number;
  title: string;
  cover_url: string | null;
  author: string | null;
  status: string | null;
  genres: string[];
  latest_chapter: string | null;
  because: string | null;
  reason: string | null;
  readers: number | null;
}

export interface MangaSourceRecord {
  id: number;
  manga_id: number;
  source: MangaSource;
  source_title: string;
  manga_details_url: string;
  latest_chapter: string | null;
  latest_chapter_url: string | null;
  latest_chapter_at: string | null;
  last_scraped_at: string | null;
}

export interface TrackedManga {
  id: number;
  user_id: number;
  manga_id: number;
  preferred_source_record_id: number | null;
  last_chapter_read: string | null;
  last_chapter_url: string | null;
  reading_status: ReadingStatus;
  user_status_override: MangaStatus | null;
  notifications_enabled: boolean;
  rating: number | null;
  created_at: string;
  updated_at: string;
  manga: Manga;
  preferred_source_record: MangaSourceRecord | null;
}

export interface TrackedMangaUpdate {
  last_chapter_read?: string | null;
  last_chapter_url?: string | null;
  reading_status?: ReadingStatus;
  notifications_enabled?: boolean;
  rating?: number | null;
}

export interface TrackingStats {
  total: number;
  reading: number;
  completed: number;
  on_hold: number;
  dropped: number;
  plan_to_read: number;
}

export interface RecentChapter {
  tracking_id: number;
  manga_id: number;
  manga_title: string;
  manga_cover_url: string | null;
  chapter: string;
  chapter_url: string | null;
  chapter_at: string | null;
  source: string;
  is_new: boolean;
}

export interface SearchCandidate {
  title: string;
  url: string;
  cover_url: string | null;
  author: string | null;
  status: string | null;
  alternative_titles: string[];
  source: string;
}

/** A title as its source site describes it right now (GET /manga/details). Nothing is saved on the server by asking. */
export interface MangaDetail {
  title: string;
  url: string;
  cover_url: string | null;
  author: string | null;
  status: string | null;
  summary: string | null;
  genres: string[];
  alternative_titles: string[];
  latest_chapter: string | null;
  latest_chapter_url: string | null;
  latest_chapter_at: string | null;
  source: string;
}

export interface TrackFromSourceRequest {
  url: string;
  source: string;
  reading_status?: ReadingStatus;
  last_chapter_read?: string | null;
  last_chapter_url?: string | null;
  notifications_enabled?: boolean;
  rating?: number | null;
}

export interface AppNotification {
  id: number;
  user_id: number;
  manga_id: number;
  source_record_id: number | null;
  chapter_released: string;
  latest_chapter_url: string | null;
  source: string;
  is_read: boolean;
  created_at: string;
  manga: Manga;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
}

/** The account feature that turns mood recommendations on (set by an administrator). */
export const MOOD_FEATURE = "mood_recommendations";

export const MOODS = [
  { key: "happy", label: "Happy", emoji: "😊" },
  { key: "sad", label: "Emotional", emoji: "😢" },
  { key: "adventurous", label: "Adventurous", emoji: "⚡" },
  { key: "relaxed", label: "Relaxed", emoji: "😌" },
  { key: "romantic", label: "Romantic", emoji: "💕" },
  { key: "intense", label: "Intense", emoji: "🔥" },
  { key: "epic", label: "Epic", emoji: "🌌" },
  { key: "thriller", label: "Thriller", emoji: "😱" },
] as const;
export type MoodKey = (typeof MOODS)[number]["key"];

export interface MoodPick {
  title: string;
  genres: string[];
  reason: string;
  mood_match: "high" | "medium" | "low";
  /** The title is already in the reader's library; `manga_id` is then its manga id. */
  from_your_library: boolean;
  manga_id: number | null;
}

/** The answer of POST /recommendations/by-mood. One request costs one of the reader's daily AI requests. */
export interface MoodResult {
  mood: string;
  mood_analysis: string;
  recommendations: MoodPick[];
  generated_by: string;
}

export interface MoodRequest {
  mood: MoodKey;
  context?: string;
}
