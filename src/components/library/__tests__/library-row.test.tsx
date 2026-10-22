import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { TrackedManga } from "@/api/types";
import { LibraryRow } from "../LibraryRow";

const NOW = "2026-10-14T12:00:00Z";
const item = {
  id: 1, user_id: 1, manga_id: 1, preferred_source_record_id: null, last_chapter_read: "5", last_chapter_url: null, reading_status: "reading", user_status_override: null,
  notifications_enabled: true, rating: null, created_at: NOW, updated_at: NOW, preferred_source_record: null,
  manga: { id: 1, canonical_name: "Berserk", genres: null, author: null, summary: null, cover_url: null, latest_chapter: "9", latest_chapter_url: null, global_status: "ongoing", created_at: NOW, updated_at: NOW },
} as TrackedManga;

beforeEach(() => {
  jest.useFakeTimers();
  const helper = require("react-native/src/private/animated/NativeAnimatedHelper").default;
  jest.spyOn(helper, "shouldUseNativeDriver").mockReturnValue(false);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it("opens the title when tapped, and sinks a little under the finger", async () => {
  const onPress = jest.fn();
  await render(<LibraryRow item={item} onPress={onPress} />);
  const row = screen.getByRole("button", { name: /^Berserk\./ });
  const scale = () => StyleSheet.flatten(row.parent!.props.style).transform[0].scale as number;
  expect(scale()).toBe(1);
  await fireEvent(row, "pressIn");
  for (let i = 0; i < 6; i++) await act(async () => void jest.advanceTimersByTime(20));
  expect(scale()).toBeLessThan(1);
  await fireEvent.press(row);
  expect(onPress).toHaveBeenCalledTimes(1);
});
