import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { router } from "expo-router";
import Mood from "@/app/mood";
import { ApiError } from "@/api/client";
import { recommendationsApi, trackingApi } from "@/api/endpoints";
import type { MoodPick, MoodResult, TrackedManga } from "@/api/types";
import { useFeature } from "@/auth/AuthContext";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn() }, recommendationsApi: { byMood: jest.fn() } }));
jest.mock("@/auth/AuthContext", () => ({ useFeature: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));

const byMood = recommendationsApi.byMood as jest.Mock;
const list = trackingApi.list as jest.Mock;

const pick = (title: string, over: Partial<MoodPick> = {}): MoodPick => ({ title, genres: ["Comedy", "Slice of Life"], reason: `${title} fits.`, mood_match: "high", from_your_library: false, manga_id: null, ...over });
const result = (over: Partial<MoodResult> = {}): MoodResult => ({
  mood: "happy", mood_analysis: "You want something light.", generated_by: "anthropic",
  recommendations: [pick("Spy x Family"), pick("Dandadan", { mood_match: "medium" }), pick("Berserk", { mood_match: "low" })], ...over,
});

let client: QueryClient;
const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const tree = () => (
  <QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={metrics}>
      <Mood />
    </SafeAreaProvider>
  </QueryClientProvider>
);
const renderMood = () => render(tree());
const mood = (label: string) => screen.getByRole("radio", { name: label });
const getPicks = () => screen.getByRole("button", { name: "Get picks" });

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } } });
  (useFeature as jest.Mock).mockReturnValue(true);
  list.mockResolvedValue([]);
  byMood.mockResolvedValue(result());
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe("an account without the feature", () => {
  it("says so, and offers nothing to ask", async () => {
    (useFeature as jest.Mock).mockReturnValue(false);
    await renderMood();
    expect(screen.getByText("Mood picks aren't enabled for your account.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Get picks" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });
});

describe("choosing", () => {
  it("offers the eight moods, none chosen, and cannot ask yet", async () => {
    await renderMood();
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    for (const label of ["Happy", "Emotional", "Adventurous", "Relaxed", "Romantic", "Intense", "Epic", "Thriller"]) expect(mood(label).props.accessibilityState.selected).toBe(false);
    expect(getPicks().props.accessibilityState.disabled).toBe(true);
  });

  it("marks the chosen mood, one at a time, and can then ask", async () => {
    await renderMood();
    await fireEvent.press(mood("Epic"));
    expect(mood("Epic").props.accessibilityState).toMatchObject({ selected: true, checked: true });
    await fireEvent.press(mood("Relaxed"));
    expect(mood("Relaxed").props.accessibilityState.selected).toBe(true);
    expect(mood("Epic").props.accessibilityState.selected).toBe(false);
    expect(getPicks().props.accessibilityState.disabled).toBe(false);
  });

  it("does nothing when pressed without a mood", async () => {
    await renderMood();
    await fireEvent.press(getPicks());
    expect(byMood).not.toHaveBeenCalled();
  });

  it("limits the note to what fits a line", async () => {
    await renderMood();
    expect(screen.getByLabelText("Anything else, optional").props.maxLength).toBe(200);
  });
});

describe("asking", () => {
  it("sends the mood alone when there is no note", async () => {
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await waitFor(() => expect(byMood).toHaveBeenCalledTimes(1));
    expect(byMood).toHaveBeenCalledWith({ mood: "happy", context: undefined });
  });

  it("sends the note, tidied, and from the keyboard too", async () => {
    await renderMood();
    await fireEvent.press(mood("Thriller"));
    const input = screen.getByLabelText("Anything else, optional");
    await fireEvent.changeText(input, "  something short  ");
    await fireEvent(input, "submitEditing");
    await waitFor(() => expect(byMood).toHaveBeenCalledWith({ mood: "thriller", context: "something short" }));
  });

  it("treats a note of spaces as none", async () => {
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.changeText(screen.getByLabelText("Anything else, optional"), "   ");
    await fireEvent.press(getPicks());
    await waitFor(() => expect(byMood).toHaveBeenCalledWith({ mood: "happy", context: undefined }));
  });

  it("asks once when submitted twice in the same instant, because each request spends one of the day's", async () => {
    let finish!: (r: MoodResult) => void;
    byMood.mockReturnValue(new Promise<MoodResult>((resolve) => (finish = resolve)));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await act(async () => {
      screen.getByLabelText("Anything else, optional").props.onSubmitEditing();
      screen.getByLabelText("Anything else, optional").props.onSubmitEditing();
    });
    expect(byMood).toHaveBeenCalledTimes(1);
    await act(async () => finish(result()));
    await screen.findByText("Spy x Family");
  });

  it("can be asked again once an answer (or a failure) has come back", async () => {
    byMood.mockRejectedValueOnce(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await screen.findByText(/Can't reach MangaPulse/);
    await fireEvent.press(getPicks());
    await screen.findByText("Spy x Family");
    await fireEvent.press(getPicks());
    await waitFor(() => expect(byMood).toHaveBeenCalledTimes(3));
  });

  it("shows it is working, locks the choices, and asks only once however often it is pressed", async () => {
    let finish!: (r: MoodResult) => void;
    byMood.mockReturnValue(new Promise<MoodResult>((resolve) => (finish = resolve)));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await waitFor(() => expect(getPicks().props.accessibilityState.busy).toBe(true));
    expect(screen.getByText("Finding picks…")).toBeTruthy();
    expect(screen.getByText("This can take up to a minute.")).toBeTruthy();
    expect(mood("Epic").props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(getPicks());
    await fireEvent(screen.getByLabelText("Anything else, optional"), "submitEditing");
    expect(byMood).toHaveBeenCalledTimes(1);
    await act(async () => finish(result()));
    expect(await screen.findByText("Spy x Family")).toBeTruthy();
    expect(screen.queryByText("Finding picks…")).toBeNull();
  });
});

describe("the picks", () => {
  const ask = async () => {
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await screen.findByText("Spy x Family");
  };

  it("shows what the AI made of the mood, and each title with its genres, reason and how well it fits", async () => {
    await ask();
    expect(screen.getByText("You want something light.")).toBeTruthy();
    expect(screen.getByText("Great match")).toBeTruthy();
    expect(screen.getByText("Good match")).toBeTruthy();
    expect(screen.getByText("Mild match")).toBeTruthy();
    expect(screen.getByText("Spy x Family fits.")).toBeTruthy();
    expect(screen.getAllByText("Comedy")).toHaveLength(3);
  });

  it("says which AI suggested them, and that a title may not be on every site", async () => {
    await ask();
    expect(screen.getByText(/Suggested by Claude \(Anthropic\)\. Titles may not exist on every site\./)).toBeTruthy();
  });

  it("names the other AI provider, and copes with an unknown one", async () => {
    byMood.mockResolvedValue(result({ generated_by: "openai" }));
    await ask();
    expect(screen.getByText(/Suggested by OpenAI/)).toBeTruthy();
  });

  it("shows no more than four genres on a card", async () => {
    byMood.mockResolvedValue(result({ recommendations: [pick("Long", { genres: ["A", "B", "C", "D", "E", "F"] })] }));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await screen.findByText("Long");
    expect(screen.queryByText("E")).toBeNull();
    expect(screen.getByText("D")).toBeTruthy();
  });

  it("sends a title not in the library to the Search tab to be found and tracked", async () => {
    await ask();
    await fireEvent.press(screen.getByRole("button", { name: "Find Dandadan to track it" }));
    expect(router.navigate).toHaveBeenCalledWith({ pathname: "/search", params: { q: "Dandadan", t: expect.any(String) } });
  });

  it("opens a title already in the library, by its place there", async () => {
    byMood.mockResolvedValue(result({ recommendations: [pick("Berserk", { from_your_library: true, manga_id: 7 })] }));
    list.mockResolvedValue([{ id: 41, manga_id: 7 } as TrackedManga]);
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await fireEvent.press(await screen.findByRole("button", { name: "Open Berserk, in your library" }));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/manga/[id]", params: { id: "41" } });
    expect(screen.queryByRole("button", { name: /Find Berserk/ })).toBeNull();
  });

  it("only says it is in the library when its place there is not known", async () => {
    byMood.mockResolvedValue(result({ recommendations: [pick("Berserk", { from_your_library: true, manga_id: 99 })] }));
    list.mockResolvedValue([{ id: 41, manga_id: 7 } as TrackedManga]);
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    expect(await screen.findByLabelText("In your library")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Berserk/ })).toBeNull();
  });
});

describe("when it goes wrong", () => {
  it("shows the daily limit, with when it resets, and nothing else", async () => {
    byMood.mockRejectedValue(new ApiError(429, "Daily AI limit of 5 reached. It resets at 00:00 UTC."));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    expect(await screen.findByText("Daily AI limit of 5 reached. It resets at 00:00 UTC.")).toBeTruthy();
    expect(screen.queryByText("Spy x Family")).toBeNull();
  });

  it("asks to try again later when the server cannot be reached", async () => {
    byMood.mockRejectedValue(new ApiError(0, "Can't reach MangaPulse. Check your connection and try again later."));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    expect(await screen.findByText("Can't reach MangaPulse. Check your connection and try again later.")).toBeTruthy();
  });

  it("does not ask again behind the reader's back, and asks once more when pressed again", async () => {
    byMood.mockRejectedValueOnce(new ApiError(503, "AI recommendations are not enabled on this server."));
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await screen.findByText(/AI service may be unavailable/);
    expect(byMood).toHaveBeenCalledTimes(1);
    await fireEvent.press(getPicks());
    expect(await screen.findByText("Spy x Family")).toBeTruthy();
    expect(screen.queryByText(/AI service may be unavailable/)).toBeNull();
    expect(byMood).toHaveBeenCalledTimes(2);
  });

  it("keeps the picks already shown when the next request fails", async () => {
    await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await screen.findByText("Spy x Family");
    byMood.mockRejectedValue(new ApiError(429, "Daily AI limit of 5 reached. It resets at 00:00 UTC."));
    await fireEvent.press(mood("Epic"));
    await fireEvent.press(getPicks());
    expect(await screen.findByText(/Daily AI limit/)).toBeTruthy();
    expect(screen.getByText("Spy x Family")).toBeTruthy();
  });
});

describe("coming back to it", () => {
  it("shows the last picks and the mood they were for, without asking (and spending) again", async () => {
    const first = await renderMood();
    await fireEvent.press(mood("Happy"));
    await fireEvent.press(getPicks());
    await screen.findByText("Spy x Family");
    await first.unmount();
    await renderMood();
    expect(await screen.findByText("Spy x Family")).toBeTruthy();
    expect(mood("Happy").props.accessibilityState.selected).toBe(true);
    expect(byMood).toHaveBeenCalledTimes(1);
  });
});
