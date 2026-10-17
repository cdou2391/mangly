import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { TrackedManga } from "@/api/types";
import { clearExports, shareLibrary } from "../shareLibrary";

jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const available = Sharing.isAvailableAsync as jest.Mock;
const share = Sharing.shareAsync as jest.Mock;
const out = (name: string) => new File(Paths.cache, name);

const NOW = "2026-10-14T12:00:00Z";
const one = { id: 1, reading_status: "reading", rating: 4, last_chapter_read: "9", notifications_enabled: true, created_at: NOW, manga: { canonical_name: "Naruto", genres: [], global_status: "ongoing" }, preferred_source_record: null } as unknown as TrackedManga;

beforeEach(() => {
  jest.clearAllMocks();
  available.mockResolvedValue(true);
  share.mockResolvedValue(undefined);
  for (const n of ["mangapulse-library.csv", "mangapulse-library.json"]) if (out(n).exists) out(n).delete();
});

describe("sharing the library", () => {
  it("writes the CSV to a file and opens the share sheet for it", async () => {
    await shareLibrary("csv", [one]);
    const file = out("mangapulse-library.csv");
    expect(file.exists).toBe(true);
    expect(file.textSync()).toContain("Naruto");
    expect(share).toHaveBeenCalledWith(file.uri, { mimeType: "text/csv", dialogTitle: "Export your library" });
  });

  it("does the same for JSON", async () => {
    await shareLibrary("json", [one]);
    expect(JSON.parse(out("mangapulse-library.json").textSync()).count).toBe(1);
    expect(share).toHaveBeenCalledWith(out("mangapulse-library.json").uri, expect.objectContaining({ mimeType: "application/json" }));
  });

  it("replaces the last export instead of adding to it", async () => {
    await shareLibrary("json", [one, one]);
    await shareLibrary("json", [one]);
    expect(JSON.parse(out("mangapulse-library.json").textSync()).count).toBe(1);
  });

  it("says so, and writes nothing, when the device cannot share", async () => {
    available.mockResolvedValue(false);
    await expect(shareLibrary("csv", [one])).rejects.toThrow("Sharing isn't available on this device.");
    expect(out("mangapulse-library.csv").exists).toBe(false);
    expect(share).not.toHaveBeenCalled();
  });

  it("passes on a failure to open the share sheet", async () => {
    share.mockRejectedValue(new Error("no app"));
    await expect(shareLibrary("csv", [one])).rejects.toThrow("no app");
  });
});

describe("clearing exports", () => {
  it("deletes the exported files, and is fine when there are none", async () => {
    await shareLibrary("csv", [one]);
    await shareLibrary("json", [one]);
    clearExports();
    expect(out("mangapulse-library.csv").exists).toBe(false);
    expect(out("mangapulse-library.json").exists).toBe(false);
    expect(() => clearExports()).not.toThrow();
  });
});
