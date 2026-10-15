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
