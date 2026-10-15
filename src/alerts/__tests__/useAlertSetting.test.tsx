import { Linking } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { isOn, turnOff, turnOn } from "../control";
import { useAlertSetting } from "../useAlertSetting";

jest.mock("../control", () => ({ isOn: jest.fn(), turnOn: jest.fn(), turnOff: jest.fn(async () => {}) }));

const on = isOn as jest.Mock;
const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  on.mockResolvedValue(true);
});

it("is unknown until the saved choice is read, then shows it", async () => {
  let read!: (v: boolean) => void;
  on.mockReturnValue(new Promise<boolean>((resolve) => (read = resolve)));
  const { result } = await renderHook(() => useAlertSetting());
  expect(result.current.on).toBeNull();
  await act(async () => read(true));
  expect(result.current.on).toBe(true);
});

it("is off if the saved choice cannot be read", async () => {
  on.mockRejectedValue(new Error("x"));
  const { result } = await renderHook(() => useAlertSetting());
  await waitFor(() => expect(result.current.on).toBe(false));
});

it("turns on, after the system allows it", async () => {
  on.mockResolvedValue(false);
  (turnOn as jest.Mock).mockResolvedValue("on");
  const { result } = await renderHook(() => useAlertSetting());
  await waitFor(() => expect(result.current.on).toBe(false));
  await act(async () => result.current.set(true));
  expect(result.current.on).toBe(true);
  expect(open).not.toHaveBeenCalled();
});

it("stays off and opens the system settings when the system will not let the app ask", async () => {
  on.mockResolvedValue(false);
  (turnOn as jest.Mock).mockResolvedValue("denied");
  const { result } = await renderHook(() => useAlertSetting());
  await waitFor(() => expect(result.current.on).toBe(false));
  await act(async () => result.current.set(true));
  expect(result.current.on).toBe(false);
  expect(open).toHaveBeenCalled();
});

it("turns off", async () => {
  const { result } = await renderHook(() => useAlertSetting());
  await waitFor(() => expect(result.current.on).toBe(true));
  await act(async () => result.current.set(false));
  expect(turnOff).toHaveBeenCalled();
  expect(result.current.on).toBe(false);
});

it("is busy while changing, and not afterwards, even if it fails", async () => {
  let fail!: (e: Error) => void;
  (turnOn as jest.Mock).mockReturnValue(new Promise((_, reject) => (fail = reject)));
  on.mockResolvedValue(false);
  const { result } = await renderHook(() => useAlertSetting());
  await waitFor(() => expect(result.current.on).toBe(false));
  let pending!: Promise<void>;
  await act(async () => void (pending = result.current.set(true).catch(() => {})));
  expect(result.current.busy).toBe(true);
  await act(async () => {
    fail(new Error("boom"));
    await pending;
  });
  expect(result.current.busy).toBe(false);
});
