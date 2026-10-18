import { AppState, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { authApi } from "@/api/endpoints";
import { ping, restoreSession } from "@/api/client";
import type { RestoreOutcome } from "@/api/client";
import { setOnline } from "@/api/reachability";
import { clearExports } from "@/export/shareLibrary";
import { clearSnapshot, loadSnapshot, MAX_AGE_MS, restoreInto, startPersisting, type Snapshot } from "@/cache/store";
import { AuthProvider, RETRY_DELAYS_MS, STARTUP_WAIT_MS, useAuth, useFeature } from "../AuthContext";

type Listener = (pair: { user: { id: number; full_name: string } } | null) => void;
let listener: Listener = () => {};
jest.mock("@/api/client", () => ({
  restoreSession: jest.fn(),
  ping: jest.fn(),
  setSessionListener: (fn: Listener) => {
    listener = fn;
  },
}));
jest.mock("@/cache/store", () => ({
  ...jest.requireActual("@/cache/store"),
  restoreInto: jest.fn(jest.requireActual("@/cache/store").restoreInto),
  loadSnapshot: jest.fn(async () => null),
  clearSnapshot: jest.fn(async () => {}),
  startPersisting: jest.fn(() => ({ flush: jest.fn(), stop: jest.fn() })),
}));
jest.mock("@/api/endpoints", () => ({ authApi: { login: jest.fn(), logout: jest.fn(async () => {}), changePassword: jest.fn() } }));
jest.mock("@/export/shareLibrary", () => ({ clearExports: jest.fn() }));
jest.mock("@/alerts", () => ({ stopAlerts: jest.fn(async () => {}) }));

const restore = restoreSession as jest.Mock;
const apiChange = authApi.changePassword as jest.Mock;
const apiLogin = authApi.login as jest.Mock;
const apiLogout = authApi.logout as jest.Mock;
const pingServer = ping as jest.Mock;
const load = loadSnapshot as jest.Mock;
let client: QueryClient;
const handlers = new Set<(state: string) => void>();
const foreground = (state: string) => handlers.forEach((h) => h(state));
let removed: jest.Mock;

/** The restore call, and what it does when it answers: signed in and rejected both go through the session listener, as in the app. */
const answers = (outcome: RestoreOutcome) => async () => {
  if (outcome === "ok") listener({ user: ada });
  if (outcome === "rejected") listener(null);
  return outcome;
};

function Probe() {
  const { state, retry } = useAuth();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Text testID="retry" onPress={() => void retry()}>
        retry
      </Text>
    </>
  );
}
const status = () => screen.getByTestId("status").props.children as string;
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );

const ada = { id: 1, full_name: "Ada" };
const copy = (over: Partial<Snapshot> = {}) =>
  ({
    version: 1,
    user: ada,
    syncedAt: Date.now() - 60_000,
    state: { mutations: [], queries: [{ queryKey: ["tracked"], queryHash: '["tracked"]', state: { data: [{ id: 7 }], dataUpdateCount: 1, dataUpdatedAt: Date.now() - 60_000, error: null, errorUpdateCount: 0, errorUpdatedAt: 0, fetchFailureCount: 0, fetchFailureReason: null, fetchMeta: null, isInvalidated: false, status: "success", fetchStatus: "idle" } }] },
    ...over,
  }) as unknown as Snapshot;
const wait = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  jest.useFakeTimers();
  restore.mockReset();
  pingServer.mockReset();
  load.mockReset().mockResolvedValue(null);
  (clearSnapshot as jest.Mock).mockClear();
  (startPersisting as jest.Mock).mockClear();
  (restoreInto as jest.Mock).mockClear();
  setOnline(true);
  client = new QueryClient();
  removed = jest.fn();
  handlers.clear();
  const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    handlers.add(handler as (state: string) => void);
    return {
      remove: () => {
        handlers.delete(handler as (state: string) => void);
        removed();
      },
    } as never;
  });
  spy.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("starting up", () => {
  it("is signed out when nothing is stored", async () => {
    restore.mockImplementation(answers("none"));
    await mount();
    await wait(0);
    expect(status()).toBe("signedOut");
  });

  it("is signed in when the stored session is good", async () => {
    restore.mockImplementation(answers("ok"));
    await mount();
    await wait(0);
    expect(status()).toBe("signedIn");
  });

  it("is signed out when the server refuses the stored session", async () => {
    restore.mockImplementation(answers("rejected"));
    await mount();
    await wait(0);
    expect(status()).toBe("signedOut");
  });

  it("is unreachable, not signed out, when the server cannot be asked", async () => {
    restore.mockImplementation(answers("unreachable"));
    await mount();
    await wait(0);
    expect(status()).toBe("unreachable");
  });

  it("waits for a slow server, then moves on to unreachable instead of holding the splash", async () => {
    restore.mockReturnValue(new Promise(() => {})); // never answers
    await mount();
    await wait(STARTUP_WAIT_MS - 100);
    expect(status()).toBe("loading");
    await wait(200);
    expect(status()).toBe("unreachable");
  });

  it("still signs in if the slow server answers after the app has moved on", async () => {
    let answer!: (o: RestoreOutcome) => void;
    restore.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await mount();
    await wait(STARTUP_WAIT_MS + 100);
    expect(status()).toBe("unreachable");
    await act(async () => {
      listener({ user: ada }); // what a late good answer does
      answer("ok");
    });
    expect(status()).toBe("signedIn");
  });
});

describe("while unreachable", () => {
  beforeEach(() => restore.mockImplementation(answers("unreachable")));

  it("retries by itself, backing off, and stops once it gets through", async () => {
    await mount();
    await wait(0);
    expect(restore).toHaveBeenCalledTimes(1);

    await wait(RETRY_DELAYS_MS[0] - 100);
    expect(restore).toHaveBeenCalledTimes(1);
    await wait(200);
    expect(restore).toHaveBeenCalledTimes(2);

    await wait(RETRY_DELAYS_MS[1] + 100);
    expect(restore).toHaveBeenCalledTimes(3);

    restore.mockImplementation(answers("ok"));
    await wait(RETRY_DELAYS_MS[2] + 100);
    expect(status()).toBe("signedIn");
    const calls = restore.mock.calls.length;
    await wait(120_000);
    expect(restore).toHaveBeenCalledTimes(calls); // no more attempts once signed in
  });

  it("keeps retrying at the longest pause", async () => {
    await mount();
    await wait(0);
    for (const d of RETRY_DELAYS_MS) await wait(d + 10);
    const calls = restore.mock.calls.length;
    await wait(RETRY_DELAYS_MS.at(-1)! + 10);
    expect(restore).toHaveBeenCalledTimes(calls + 1);
  });

  it("retries at once when the app comes back to the foreground", async () => {
    await mount();
    await wait(0);
    const before = restore.mock.calls.length;
    restore.mockImplementation(answers("ok"));
    await act(async () => foreground("active"));
    expect(restore).toHaveBeenCalledTimes(before + 1);
    expect(status()).toBe("signedIn");
  });

  it("ignores the app going to the background", async () => {
    await mount();
    await wait(0);
    const before = restore.mock.calls.length;
    await act(async () => foreground("background"));
    expect(restore).toHaveBeenCalledTimes(before);
  });

  it("can be retried on request, and the answer decides where the app goes", async () => {
    await mount();
    await wait(0);
    restore.mockImplementation(answers("rejected"));
    await act(async () => screen.getByTestId("retry").props.onPress());
    expect(status()).toBe("signedOut");
  });

  it("stops everything when the app is closed", async () => {
    const view = await mount();
    await wait(0);
    await view.unmount();
    const calls = restore.mock.calls.length;
    await wait(300_000);
    expect(restore).toHaveBeenCalledTimes(calls);
    expect(removed).toHaveBeenCalled();
  });
});

it("never retries or reacts to the foreground while signed in and online", async () => {
  restore.mockImplementation(answers("ok"));
  await mount();
  await wait(0);
  await wait(300_000);
  await act(async () => foreground("active"));
  expect(restore).toHaveBeenCalledTimes(1);
  expect(pingServer).not.toHaveBeenCalled();
});

describe("with an offline copy", () => {
  const offline = () => {
    restore.mockImplementation(async () => {
      setOnline(false); // what the failed request itself reports
      return "unreachable";
    });
  };

  it("opens straight into the app on the copy when the server cannot be asked", async () => {
    load.mockResolvedValue(copy());
    offline();
    await mount();
    await wait(0);
    expect(status()).toBe("signedIn");
    expect(client.getQueryData(["tracked"])).toEqual([{ id: 7 }]);
  });

  it("does not use a copy older than seven days: the app waits for the server instead", async () => {
    load.mockResolvedValue(copy({ syncedAt: Date.now() - MAX_AGE_MS - 60_000 }));
    offline();
    await mount();
    await wait(0);
    expect(status()).toBe("unreachable");
    expect(client.getQueryData(["tracked"])).toBeUndefined();
  });

  it("does not use a copy that claims to be from the future", async () => {
    load.mockResolvedValue(copy({ syncedAt: Date.now() + 5 * 86_400_000 }));
    offline();
    await mount();
    await wait(0);
    expect(status()).toBe("unreachable");
  });

  it("opens on the copy instead of holding the splash when the server is slow", async () => {
    load.mockResolvedValue(copy());
    restore.mockReturnValue(new Promise(() => {}));
    await mount();
    await wait(STARTUP_WAIT_MS + 100);
    expect(status()).toBe("signedIn");
  });

  it("goes to the login screen, and forgets the copy, when the server then refuses the session", async () => {
    load.mockResolvedValue(copy());
    offline();
    await mount();
    await wait(0);
    expect(status()).toBe("signedIn");
    await act(async () => listener(null)); // dropSession, as after a refused refresh
    expect(status()).toBe("signedOut");
    expect(clearSnapshot).toHaveBeenCalled();
    expect(client.getQueryData(["tracked"])).toBeUndefined();
  });

  it("forgets the copy and the cache on sign-out", async () => {
    restore.mockImplementation(answers("ok"));
    await mount();
    await wait(0);
    client.setQueryData(["tracked"], [{ id: 1 }]);
    await act(async () => listener(null));
    expect(client.getQueryData(["tracked"])).toBeUndefined();
    expect(clearSnapshot).toHaveBeenCalled();
    expect(clearExports).toHaveBeenCalled(); // a shared copy of the library goes too
  });

  it("throws away another person's copy instead of showing it", async () => {
    load.mockResolvedValue(copy({ user: { id: 2, full_name: "Bob" } as never }));
    restore.mockImplementation(answers("ok")); // Ada is who signs in
    await mount();
    await wait(0);
    expect(status()).toBe("signedIn");
    expect(clearSnapshot).toHaveBeenCalled();
    expect(client.getQueryData(["tracked"])).toBeUndefined();
  });

  it("loads the copy into the cache once, not again when the session is renewed later", async () => {
    load.mockResolvedValue(copy());
    offline();
    await mount();
    await wait(0);
    expect(restoreInto).toHaveBeenCalledTimes(1);
    await act(async () => listener({ user: ada })); // the server came back
    expect(restoreInto).toHaveBeenCalledTimes(1);
  });

  it("ends up signed out when the session is lost while the copy is still being read", async () => {
    let finishReading!: (s: Snapshot) => void;
    load.mockReturnValue(new Promise((resolve) => (finishReading = resolve)));
    restore.mockReturnValue(new Promise(() => {}));
    await mount();
    await act(async () => {
      listener({ user: ada }); // signed in ...
      listener(null); // ... and straight out again
    });
    await act(async () => finishReading(copy()));
    expect(status()).toBe("signedOut");
  });

  it("shows the copy while the server answers, when it is the same person", async () => {
    load.mockResolvedValue(copy());
    restore.mockImplementation(answers("ok"));
    await mount();
    await wait(0);
    expect(client.getQueryData(["tracked"])).toEqual([{ id: 7 }]);
    expect(clearSnapshot).not.toHaveBeenCalled();
  });

  it("keeps the saved copy's age when it starts saving, so reading it does not make it look fresh", async () => {
    const snapshot = copy({ syncedAt: Date.now() - 3 * 86_400_000 });
    load.mockResolvedValue(snapshot);
    offline();
    await mount();
    await wait(0);
    expect(startPersisting).toHaveBeenCalledWith(client, expect.any(Function), snapshot.syncedAt);
  });

  it("starts saving with no age on a fresh sign-in, so nothing is saved before the server has answered", async () => {
    restore.mockImplementation(answers("ok"));
    await mount();
    await wait(0);
    expect(startPersisting).toHaveBeenCalledWith(client, expect.any(Function), null);
  });

  describe("reconnecting", () => {
    beforeEach(async () => {
      load.mockResolvedValue(copy());
      offline();
      await mount();
      await wait(0);
    });

    it("pings the server by itself, backing off, and refreshes what is on screen once it answers", async () => {
      const refresh = jest.spyOn(client, "invalidateQueries");
      pingServer.mockResolvedValue(false);
      await wait(RETRY_DELAYS_MS[0] + 10);
      expect(pingServer).toHaveBeenCalledTimes(1);
      await wait(RETRY_DELAYS_MS[1] + 10);
      expect(pingServer).toHaveBeenCalledTimes(2);

      pingServer.mockImplementation(async () => {
        setOnline(true);
        return true;
      });
      await wait(RETRY_DELAYS_MS[2] + 10);
      expect(pingServer).toHaveBeenCalledTimes(3);
      expect(refresh).toHaveBeenCalled();
      expect(status()).toBe("signedIn");

      await wait(300_000);
      expect(pingServer).toHaveBeenCalledTimes(3); // stopped
    });

    it("pings at once when the app comes back to the foreground", async () => {
      pingServer.mockResolvedValue(false);
      await act(async () => foreground("active"));
      expect(pingServer).toHaveBeenCalledTimes(1);
    });

    it("does not renew the session by itself: the first request does that", async () => {
      pingServer.mockResolvedValue(false);
      const before = restore.mock.calls.length;
      await wait(RETRY_DELAYS_MS[0] + 10);
      expect(restore).toHaveBeenCalledTimes(before);
    });

    it("comes back online when any request gets through, without needing a ping", async () => {
      await act(async () => setOnline(true));
      pingServer.mockResolvedValue(true);
      await wait(RETRY_DELAYS_MS[0] + 10);
      expect(pingServer).not.toHaveBeenCalled();
    });
  });
});

describe("changing the password", () => {
  let auth!: ReturnType<typeof useAuth>;
  function Grab() {
    auth = useAuth();
    return null;
  }
  const signedIn = async () => {
    restore.mockImplementation(async () => {
      listener({ user: { ...ada, email: "ada@example.com" } as never });
      return "ok" as const;
    });
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Grab />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await wait(0);
  };
  beforeEach(() => {
    apiChange.mockReset().mockResolvedValue({});
    apiLogin.mockReset().mockResolvedValue({});
    apiLogout.mockClear();
  });

  it("changes it, then signs this device in again with the new password, because the server ends every session", async () => {
    await signedIn();
    let result: boolean | undefined;
    await act(async () => void (result = await auth.changePassword("old-pass1", "new-pass2")));
    expect(apiChange).toHaveBeenCalledWith("old-pass1", "new-pass2");
    expect(apiLogin).toHaveBeenCalledWith("ada@example.com", "new-pass2", "Android");
    expect(apiChange.mock.invocationCallOrder[0]).toBeLessThan(apiLogin.mock.invocationCallOrder[0]);
    expect(result).toBe(true);
    expect(apiLogout).not.toHaveBeenCalled();
  });

  it("does not sign in again, and passes the refusal on, when the server says no", async () => {
    apiChange.mockRejectedValue(new Error("Current password is incorrect."));
    await signedIn();
    await expect(auth.changePassword("wrong", "new-pass2")).rejects.toThrow("Current password is incorrect.");
    expect(apiLogin).not.toHaveBeenCalled();
    expect(apiLogout).not.toHaveBeenCalled();
  });

  it("signs the device out too when it does not know the email to sign in again with", async () => {
    restore.mockImplementation(async () => {
      listener({ user: ada as never }); // a user without an email
      return "ok" as const;
    });
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Grab />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await wait(0);
    let result: boolean | undefined;
    await act(async () => void (result = await auth.changePassword("old-pass1", "new-pass2")));
    expect(apiChange).toHaveBeenCalled();
    expect(apiLogin).not.toHaveBeenCalled();
    expect(apiLogout).toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("signs the device out, instead of leaving a dead session, when signing in again fails", async () => {
    apiLogin.mockRejectedValue(new Error("Network error."));
    await signedIn();
    let result: boolean | undefined;
    await act(async () => void (result = await auth.changePassword("old-pass1", "new-pass2")));
    expect(result).toBe(false);
    expect(apiLogout).toHaveBeenCalled();
  });
});

describe("useFeature", () => {
  function Flag({ name }: { name: string }) {
    return <Text testID="flag">{String(useFeature(name))}</Text>;
  }
  const flag = () => screen.getByTestId("flag").props.children as string;
  const signedInWith = async (features: string[]) => {
    restore.mockImplementation(async () => {
      listener({ user: { ...ada, features } as never });
      return "ok" as const;
    });
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Flag name="mood_recommendations" />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await wait(0);
    await wait(0);
  };

  it("is true when the signed-in account has the feature", async () => {
    await signedInWith(["mood_recommendations", "other"]);
    expect(flag()).toBe("true");
  });

  it("is false when it does not, and for a feature that merely contains the name", async () => {
    await signedInWith(["other"]);
    expect(flag()).toBe("false");
  });

  it("is false while nobody is signed in", async () => {
    restore.mockImplementation(answers("none"));
    await render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Flag name="mood_recommendations" />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await wait(0);
    expect(flag()).toBe("false");
  });

  it("is false outside the provider instead of throwing, so a screen can be shown on its own", async () => {
    await render(<Flag name="mood_recommendations" />);
    await wait(0);
    expect(flag()).toBe("false");
  });
});

