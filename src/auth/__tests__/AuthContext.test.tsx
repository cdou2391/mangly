import { AppState, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { restoreSession } from "@/api/client";
import type { RestoreOutcome } from "@/api/client";
import { AuthProvider, RETRY_DELAYS_MS, STARTUP_WAIT_MS, useAuth } from "../AuthContext";

type Listener = (pair: { user: { full_name: string } } | null) => void;
let listener: Listener = () => {};
jest.mock("@/api/client", () => ({
  restoreSession: jest.fn(),
  setSessionListener: (fn: Listener) => {
    listener = fn;
  },
}));
jest.mock("@/api/endpoints", () => ({ authApi: { login: jest.fn(), logout: jest.fn(async () => {}) } }));
jest.mock("@/push/register", () => ({ unregisterPush: jest.fn(async () => {}) }));

const restore = restoreSession as jest.Mock;
let foreground: (state: string) => void = () => {};
let removed: jest.Mock;

/** The restore call, and what it does when it answers: signed in and rejected both go through the session listener, as in the app. */
const answers = (outcome: RestoreOutcome) => async () => {
  if (outcome === "ok") listener({ user: { full_name: "Ada" } });
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
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
const wait = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  jest.useFakeTimers();
  restore.mockReset();
  removed = jest.fn();
  const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    foreground = handler as (state: string) => void;
    return { remove: removed } as never;
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
      listener({ user: { full_name: "Ada" } }); // what a late good answer does
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

it("never retries or listens for the foreground while signed in", async () => {
  restore.mockImplementation(answers("ok"));
  await mount();
  await wait(0);
  await wait(300_000);
  expect(restore).toHaveBeenCalledTimes(1);
  expect(AppState.addEventListener).not.toHaveBeenCalled();
});
