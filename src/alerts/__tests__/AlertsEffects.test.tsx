import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { trackingApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { AlertsEffects } from "../AlertsEffects";
import { attachUser, markSeen, resume, turnOn } from "../control";

jest.mock("@/api/endpoints", () => ({ trackingApi: { list: jest.fn() } }));
jest.mock("@/auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("expo-router", () => ({ router: { navigate: jest.fn() } }));
jest.mock("expo-notifications", () => ({ useLastNotificationResponse: jest.fn() }));
const mockOpenChapter = jest.fn();
jest.mock("@/hooks/useOpenChapter", () => ({ useOpenChapter: () => mockOpenChapter }));
jest.mock("../control", () => ({ attachUser: jest.fn(), markSeen: jest.fn(async () => {}), resume: jest.fn(async () => {}), turnOn: jest.fn(async () => "on") }));

const list = trackingApi.list as jest.Mock;
const lastResponse = Notifications.useLastNotificationResponse as jest.Mock;
const attach = attachUser as jest.Mock;

let client: QueryClient;
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <AlertsEffects />
    </QueryClientProvider>,
  );
const signedIn = (id = 1) => (useAuth as jest.Mock).mockReturnValue({ state: { status: "signedIn", user: { id } } });
const answer = (id: number) => ({ id, is_read: false });
const tap = (data: unknown, identifier = "alert-5") => ({ notification: { date: 1, request: { identifier, content: { data } } } });

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  signedIn();
  list.mockResolvedValue([{ id: 1 }]);
  attach.mockResolvedValue({ enabled: null, userId: 1, seenId: null });
  lastResponse.mockReturnValue(null);
});

afterEach(async () => {
  await act(async () => {}); // let the library query settle inside act
});

describe("setting up", () => {
  it("makes the saved state this user's", async () => {
    await mount();
    await waitFor(() => expect(attach).toHaveBeenCalledWith(1));
  });

  it("asks for permission, once there is something in the library, when it has not been asked", async () => {
    await mount();
    await waitFor(() => expect(turnOn).toHaveBeenCalledTimes(1));
    expect(resume).not.toHaveBeenCalled();
  });

  it("does not ask while the library is empty", async () => {
    list.mockResolvedValue([]);
    await mount();
    await waitFor(() => expect(attach).toHaveBeenCalled());
    await act(async () => {});
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("does not ask again once the user has answered, yes or no, and keeps the schedule going when it is on", async () => {
    attach.mockResolvedValue({ enabled: false, userId: 1, seenId: 5 });
    await mount();
    await waitFor(() => expect(resume).toHaveBeenCalled());
    expect(turnOn).not.toHaveBeenCalled();
  });

  it("does nothing for nobody", async () => {
    (useAuth as jest.Mock).mockReturnValue({ state: { status: "signedOut" } });
    await mount();
    await act(async () => {});
    expect(attach).not.toHaveBeenCalled();
  });
});

describe("what the user has seen", () => {
  it("counts alerts loaded from the server as seen, so the background check does not announce them", async () => {
    await mount();
    await act(async () => void (await client.fetchQuery({ queryKey: ["notifications"], queryFn: async () => [answer(4), answer(9), answer(6)] })));
    expect(markSeen).toHaveBeenCalledWith(1, 9);
  });

  it("does not count an optimistic edit, or the saved copy, as the server answering", async () => {
    await mount();
    await act(async () => client.setQueryData(["notifications"], [answer(50)]));
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("ignores other queries and empty lists", async () => {
    await mount();
    await act(async () => void (await client.fetchQuery({ queryKey: ["recent-chapters"], queryFn: async () => [answer(77)] })));
    await act(async () => void (await client.fetchQuery({ queryKey: ["notifications"], queryFn: async () => [], staleTime: 0 })));
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("stops listening when the screen goes away", async () => {
    const view = await mount();
    await view.unmount();
    await act(async () => void (await client.fetchQuery({ queryKey: ["notifications"], queryFn: async () => [answer(9)] })));
    expect(markSeen).not.toHaveBeenCalled();
  });
});

describe("tapping a notification", () => {
  it("opens Updates", async () => {
    lastResponse.mockReturnValue(tap({ screen: "updates" }));
    await mount();
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith("/updates"));
  });

  it("opens it once for one tap, however often the app re-renders", async () => {
    lastResponse.mockReturnValue(tap({ screen: "updates" }));
    const view = await mount();
    lastResponse.mockReturnValue(tap({ screen: "updates" })); // the same tap, as a new object
    await view.rerender(
      <QueryClientProvider client={client}>
        <AlertsEffects />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1));
  });

  it("ignores a notification that is not one of ours", async () => {
    lastResponse.mockReturnValue(tap({ other: true }));
    await mount();
    await act(async () => {});
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("does nothing when nobody is signed in", async () => {
    (useAuth as jest.Mock).mockReturnValue({ state: { status: "signedOut" } });
    lastResponse.mockReturnValue(tap({ screen: "updates" }));
    await mount();
    await act(async () => {});
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe("tapping a notification for one chapter", () => {
  const chapter = { screen: "updates", alertId: 5, mangaId: 50, chapter: "Chapter 191", chapterUrl: "https://x.test/191" };

  it("opens Updates first, then the chapter, marked read like a tap on a row of the feed", async () => {
    list.mockResolvedValue([{ id: 12, manga_id: 50 }]);
    const view = await mount();
    await waitFor(() => expect(list).toHaveBeenCalled());
    await act(async () => {}); // the library has loaded
    lastResponse.mockReturnValue(tap(chapter));
    await view.rerender(
      <QueryClientProvider client={client}>
        <AlertsEffects />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mockOpenChapter).toHaveBeenCalledTimes(1));
    expect(router.navigate).toHaveBeenCalledWith("/updates");
    expect((router.navigate as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(mockOpenChapter.mock.invocationCallOrder[0]);
    expect(mockOpenChapter).toHaveBeenCalledWith({
      notification_id: 5, manga_id: 50, chapter: "Chapter 191", chapter_url: "https://x.test/191", tracking_id: 12, unread: true,
    });
  });

  it("opens the chapter even when the library is not known yet or does not have the title", async () => {
    list.mockResolvedValue([{ id: 99, manga_id: 1 }]);
    lastResponse.mockReturnValue(tap(chapter));
    await mount();
    await waitFor(() => expect(mockOpenChapter).toHaveBeenCalled());
    expect(mockOpenChapter.mock.calls[0][0]).toMatchObject({ manga_id: 50, tracking_id: null, chapter_url: "https://x.test/191" });
  });

  it("opens the title instead when the alert has no usable link (it is passed on without one)", async () => {
    lastResponse.mockReturnValue(tap({ ...chapter, chapterUrl: "javascript:alert(1)" }));
    await mount();
    await waitFor(() => expect(mockOpenChapter).toHaveBeenCalled());
    expect(mockOpenChapter.mock.calls[0][0].chapter_url).toBeNull();
  });

  it("only opens Updates for a summary, or a notification from an older version", async () => {
    lastResponse.mockReturnValue(tap({ screen: "updates" }, "alerts-summary"));
    await mount();
    await waitFor(() => expect(router.navigate).toHaveBeenCalledWith("/updates"));
    await act(async () => {});
    expect(mockOpenChapter).not.toHaveBeenCalled();
  });

  it("opens the chapter once for one tap, however often the app re-renders", async () => {
    lastResponse.mockReturnValue(tap(chapter));
    const view = await mount();
    lastResponse.mockReturnValue(tap(chapter)); // the same tap, as a new object
    await view.rerender(
      <QueryClientProvider client={client}>
        <AlertsEffects />
      </QueryClientProvider>,
    );
    await act(async () => {});
    expect(mockOpenChapter).toHaveBeenCalledTimes(1);
  });

  it("opens each notification that is tapped", async () => {
    lastResponse.mockReturnValue(tap(chapter, "alert-5"));
    const view = await mount();
    await waitFor(() => expect(mockOpenChapter).toHaveBeenCalledTimes(1));
    lastResponse.mockReturnValue(tap({ ...chapter, alertId: 6, chapter: "192" }, "alert-6"));
    await view.rerender(
      <QueryClientProvider client={client}>
        <AlertsEffects />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mockOpenChapter).toHaveBeenCalledTimes(2));
    expect(mockOpenChapter.mock.calls[1][0].chapter).toBe("192");
  });

  it("opens nothing for nobody", async () => {
    (useAuth as jest.Mock).mockReturnValue({ state: { status: "signedOut" } });
    lastResponse.mockReturnValue(tap(chapter));
    await mount();
    await act(async () => {});
    expect(mockOpenChapter).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("ignores a notification that is not one of ours, even with a chapter in it", async () => {
    lastResponse.mockReturnValue(tap({ alertId: 5, mangaId: 50, chapter: "1" }));
    await mount();
    await act(async () => {});
    expect(mockOpenChapter).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

