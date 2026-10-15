const NAMES: Record<string, string> = { mangaread: "MangaRead", weebcentral: "WeebCentral" };

/** Display name of a source site ("mangaread" -> "MangaRead"); unknown sources are shown as they are. */
export const sourceName = (source: string): string => NAMES[source.toLowerCase()] ?? source;
