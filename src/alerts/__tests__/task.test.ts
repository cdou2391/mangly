import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { Platform } from "react-native";
import { runAlertsCheck } from "../check";
import { ALERTS_TASK, CHECK_EVERY_MINUTES, registerAlertsTask, unregisterAlertsTask } from "../registration";

jest.mock("../check", () => ({ runAlertsCheck: jest.fn() }));
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn(), isTaskRegisteredAsync: jest.fn() }));
jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(async () => {}),
  unregisterTaskAsync: jest.fn(async () => {}),
}));

const registered = TaskManager.isTaskRegisteredAsync as jest.Mock;

describe("the background task", () => {
  const executor = () => {
    jest.isolateModules(() => require("../task"));
    return (TaskManager.defineTask as jest.Mock).mock.calls.at(-1)![1] as () => Promise<number>;
  };

  it("is defined as soon as the module loads, under the name the scheduler uses", () => {
    executor();
    expect(TaskManager.defineTask).toHaveBeenCalledWith(ALERTS_TASK, expect.any(Function));
  });

  it("reports success after a check", async () => {
    (runAlertsCheck as jest.Mock).mockResolvedValue("nothing");
    expect(await executor()()).toBe(1);
  });

  it("reports failure, without throwing, when the check throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    (runAlertsCheck as jest.Mock).mockRejectedValue(new Error("boom"));
    expect(await executor()()).toBe(2);
    warn.mockRestore();
  });
});

describe("the app's entry point", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fs: any = require("fs");
  const root = process.cwd();

  it("is index.ts, because the system starts the app headless to run the check", () => {
    expect(JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8")).main).toBe("index.ts");
  });

  it("defines the task before handing over to the router", () => {
    const lines = fs.readFileSync(`${root}/index.ts`, "utf8").split("\n").filter((l: string) => l.startsWith("import"));
    expect(lines).toEqual(['import "./src/alerts/task";', 'import "expo-router/entry";']);
  });
});

describe("scheduling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = "android";
  });

  it("schedules the check, every 15 minutes at the soonest", async () => {
    registered.mockResolvedValue(false);
    await registerAlertsTask();
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(ALERTS_TASK, { minimumInterval: 15 });
    expect(CHECK_EVERY_MINUTES).toBe(15);
  });

  it("does not schedule twice: that would reset the run that is waiting", async () => {
    registered.mockResolvedValue(true);
    await registerAlertsTask();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });

  it("cancels the schedule, if there is one", async () => {
    registered.mockResolvedValue(true);
    await unregisterAlertsTask();
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(ALERTS_TASK);
    jest.clearAllMocks();
    registered.mockResolvedValue(false);
    await unregisterAlertsTask();
    expect(BackgroundTask.unregisterTaskAsync).not.toHaveBeenCalled();
  });

  it("does nothing off Android", async () => {
    Platform.OS = "web" as never;
    registered.mockResolvedValue(false);
    await registerAlertsTask();
    await unregisterAlertsTask();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
    Platform.OS = "android";
  });
});
