import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { TrackedManga } from "@/api/types";
import { EXPORT_TYPES, exportFileName, exportText, type ExportFormat } from "@/utils/exportLibrary";

const FORMATS = Object.keys(EXPORT_TYPES) as ExportFormat[];
const fileFor = (format: ExportFormat) => new File(Paths.cache, exportFileName(format));

/**
 * Writes the library to a file in the app's private cache and opens the system share sheet for it (save to Files or Drive,
 * mail it, open it in a spreadsheet). The file is only a hand-over: it is replaced by the next export and removed on sign-out.
 */
export async function shareLibrary(format: ExportFormat, items: TrackedManga[]): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
  const file = fileFor(format);
  file.create({ overwrite: true });
  file.write(exportText(format, items));
  await Sharing.shareAsync(file.uri, { mimeType: EXPORT_TYPES[format].mime, dialogTitle: "Export your library" });
}

/** Deletes any exported copies. Never throws. */
export function clearExports() {
  for (const format of FORMATS) {
    try {
      const file = fileFor(format);
      if (file.exists) file.delete();
    } catch {
      // the cache folder is also emptied by the system when it needs the space
    }
  }
}
