import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AlertHistory from "@/app/alert-history";
import { appendHistory } from "@/alerts/history";

jest.mock("expo-secure-store", () => require("@/test-utils/mocks").secureStoreMock());
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));

const metrics = { frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AlertHistory />
    </SafeAreaProvider>,
  );
const at = (days: number, h: number, m: number) => new Date(2026, 9, 20 - days, h, m).getTime();

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"], now: new Date(2026, 9, 20, 15, 0) });
  const { store } = require("@/test-utils/mocks");
  Object.keys(store).forEach((k) => delete store[k]);
});
afterEach(() => jest.useRealTimers());

it("explains what Found and Notified mean", async () => {
  await renderScreen();
  expect(await screen.findByText("Recent alerts")).toBeTruthy();
  expect(screen.getByText(/is when MangaPulse added the chapter/)).toBeTruthy();
  expect(screen.getByText(/is when this phone showed the notification/)).toBeTruthy();
});

it("says so when there are none yet", async () => {
  await renderScreen();
  expect(await screen.findByText("No alerts yet")).toBeTruthy();
});

it("lists each chapter with when it was found, when it was notified and the gap, newest first", async () => {
  await appendHistory([
    { id: 1, title: "Berserk", chapter: "Chapter 12", found: at(1, 8, 0), sent: at(1, 9, 20) },
    { id: 2, title: "Chainsaw Man", chapter: "191", found: at(0, 14, 2), sent: at(0, 14, 37) },
  ]);
  await renderScreen();
  const titles = (await screen.findAllByText(/^(Berserk|Chainsaw Man)$/)).map((n) => n.props.children);
  expect(titles).toEqual(["Chainsaw Man", "Berserk"]);
  expect(screen.getByLabelText("Chainsaw Man, Ch. 191. Found Today 14:02. Notified Today 14:37, 35 min later.")).toBeTruthy();
  expect(screen.getByLabelText("Berserk, Ch. 12. Found Yesterday 08:00. Notified Yesterday 09:20, 1 h 20 min later.")).toBeTruthy();
  expect(screen.getByText("35 min later")).toBeTruthy();
});
