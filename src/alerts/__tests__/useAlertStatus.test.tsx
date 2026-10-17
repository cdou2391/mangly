import { AppState } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { EMPTY, readState } from "../state";
import { useAlertStatus } from "../useAlertStatus";

jest.mock("../state", () => ({ ...jest.requireActual("../state"), readState: jest.fn() }));
const read = readState as jest.Mock;

const handlers = new Set<(state: string) => void>();
let removed: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  handlers.clear();
  removed = jest.fn();
  read.mockResolvedValue({ ...EMPTY, enabled: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    handlers.add(handler as (state: string) => void);
    return { remove: () => { handlers.delete(handler as (state: string) => void); removed(); } } as never;
  });
});
afterEach(() => jest.restoreAllMocks());

it("is unknown until the saved state has been read, then shows it", async () => {
  let finish!: (v: unknown) => void;
  read.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const { result } = await renderHook(() => useAlertStatus());
  expect(result.current.state).toBeNull();
  await act(async () => finish({ ...EMPTY, enabled: true, seenId: 3 }));
  expect(result.current.state).toMatchObject({ enabled: true, seenId: 3 });
});

it("reads again when the app comes back to the front, because the check writes while the app is closed", async () => {
  const { result } = await renderHook(() => useAlertStatus());
  await waitFor(() => expect(result.current.state).not.toBeNull());
  read.mockResolvedValue({ ...EMPTY, lastCheck: { at: 1, result: "nothing", shown: 0 } });
  await act(async () => handlers.forEach((h) => h("background")));
  expect(read).toHaveBeenCalledTimes(1); // leaving the app is not a reason to read
  await act(async () => handlers.forEach((h) => h("active")));
  await waitFor(() => expect(result.current.state?.lastCheck?.result).toBe("nothing"));
});

it("reads again when a screen asks", async () => {
  const { result } = await renderHook(() => useAlertStatus());
  await waitFor(() => expect(result.current.state).not.toBeNull());
  read.mockResolvedValue({ ...EMPTY, delays: [4] });
  await act(async () => result.current.refresh());
  expect(result.current.state?.delays).toEqual([4]);
});

it("keeps what it showed when reading fails", async () => {
  const { result } = await renderHook(() => useAlertStatus());
  await waitFor(() => expect(result.current.state).not.toBeNull());
  read.mockRejectedValue(new Error("locked"));
  await act(async () => result.current.refresh());
  expect(result.current.state).toMatchObject({ enabled: true });
});

it("stops listening when the screen goes away", async () => {
  const view = await renderHook(() => useAlertStatus());
  await view.unmount();
  expect(removed).toHaveBeenCalledTimes(1);
});
