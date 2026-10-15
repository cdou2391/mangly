import type { SearchCandidate, TrackedManga } from "@/api/types";
import { candidatesFor, findInLibrary, groupCandidates, normalizeTitle, sourcesIn } from "../search";

const cand = (title: string, source: string, over: Partial<SearchCandidate> = {}): SearchCandidate => ({
  title, url: `https://${source}.test/${title.toLowerCase().replace(/\W+/g, "-")}/`, cover_url: null, author: null, status: null, alternative_titles: [], source, ...over,
});
const tracked = (name: string, url: string | null = null): TrackedManga =>
  ({ id: 7, manga: { canonical_name: name }, preferred_source_record: url ? { manga_details_url: url } : null }) as TrackedManga;

describe("normalizeTitle", () => {
  it("ignores case, punctuation, spacing and accents", () => {
    expect(normalizeTitle("Dragon  Ball!")).toBe("dragon ball");
    expect(normalizeTitle("  DRAGON-ball ")).toBe("dragon ball");
    expect(normalizeTitle("Pokémon: Adventures")).toBe("pokemon adventures");
  });
  it("keeps titles in other scripts", () => {
    expect(normalizeTitle("進撃の巨人")).toBe("進撃の巨人");
  });
  it("is empty for a title with no letters or digits", () => {
    expect(normalizeTitle("!!!")).toBe("");
  });
});

describe("groupCandidates", () => {
  it("puts the same title from two sites in one group, once per site", () => {
    const groups = groupCandidates([cand("Dragon Ball", "mangaread"), cand("Dragon Ball", "weebcentral"), cand("Dragon Ball", "weebcentral", { url: "https://x.test/other/" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].candidates.map((c) => c.source)).toEqual(["mangaread", "weebcentral"]);
  });

  it("treats different spellings of the same title as one", () => {
    expect(groupCandidates([cand("Dragon Ball", "mangaread"), cand("DRAGON BALL!", "weebcentral")])).toHaveLength(1);
  });

  it("keeps the server's order, a group sitting where its first result was", () => {
    const groups = groupCandidates([cand("B", "mangaread"), cand("A", "mangaread"), cand("B", "weebcentral")]);
    expect(groups.map((g) => g.title)).toEqual(["B", "A"]);
  });

  it("fills in what the first result lacked from the others", () => {
    const [g] = groupCandidates([
      cand("Dragon Ball", "mangaread"),
      cand("Dragon Ball", "weebcentral", { author: "Akira Toriyama", status: "completed", cover_url: "c.jpg" }),
    ]);
    expect(g).toMatchObject({ author: "Akira Toriyama", status: "completed", cover_url: "c.jpg" });
  });

  it("does not merge different titles", () => {
    expect(groupCandidates([cand("Dragon Ball", "mangaread"), cand("Dragon Ball Super", "mangaread")])).toHaveLength(2);
  });

  it("handles no results", () => {
    expect(groupCandidates(undefined)).toEqual([]);
    expect(groupCandidates([])).toEqual([]);
  });

  it("does not lose a title whose name has no letters or digits", () => {
    expect(groupCandidates([cand("???", "mangaread", { url: "https://a.test/1/" }), cand("!!!", "mangaread", { url: "https://a.test/2/" })])).toHaveLength(2); // keyed by link, not merged
  });
});

describe("candidatesFor", () => {
  const [g] = groupCandidates([cand("X", "mangaread"), cand("X", "weebcentral")]);
  it("tries the chosen site first and leaves the others in order", () => {
    expect(candidatesFor(g, "weebcentral").map((c) => c.source)).toEqual(["weebcentral", "mangaread"]);
    expect(candidatesFor(g, "mangaread").map((c) => c.source)).toEqual(["mangaread", "weebcentral"]);
    expect(candidatesFor(g, null).map((c) => c.source)).toEqual(["mangaread", "weebcentral"]);
  });
  it("ignores a site the title is not on, and does not change the group", () => {
    expect(candidatesFor(g, "elsewhere").map((c) => c.source)).toEqual(["mangaread", "weebcentral"]);
    expect(g.candidates.map((c) => c.source)).toEqual(["mangaread", "weebcentral"]);
  });
});

describe("sourcesIn", () => {
  it("offers the sites only when filtering would hide something", () => {
    expect(sourcesIn(groupCandidates([cand("A", "mangaread"), cand("B", "weebcentral")]))).toEqual(["mangaread", "weebcentral"]);
    expect(sourcesIn(groupCandidates([cand("A", "mangaread"), cand("A", "weebcentral"), cand("B", "mangaread")]))).toEqual(["mangaread", "weebcentral"]);
  });
  it("offers nothing when every title is on every site, or there is only one site", () => {
    expect(sourcesIn(groupCandidates([cand("A", "mangaread"), cand("A", "weebcentral")]))).toEqual([]);
    expect(sourcesIn(groupCandidates([cand("A", "mangaread"), cand("B", "mangaread")]))).toEqual([]);
    expect(sourcesIn([])).toEqual([]);
  });
});

describe("findInLibrary", () => {
  const [g] = groupCandidates([cand("Chainsaw Man", "mangaread", { alternative_titles: ["Chensō Man"] }), cand("Chainsaw Man", "weebcentral")]);

  it("finds a title by its link, ignoring a trailing slash and case", () => {
    expect(findInLibrary(g, [tracked("Something else", "HTTPS://MANGAREAD.TEST/chainsaw-man")])?.id).toBe(7);
  });
  it("finds a title by name, however it is spelled", () => {
    expect(findInLibrary(g, [tracked("chainsaw   MAN")])?.id).toBe(7);
  });
  it("finds a title by one of its alternative names", () => {
    expect(findInLibrary(g, [tracked("Chensō Man")])?.id).toBe(7);
  });
  it("does not match a different title, or a longer one", () => {
    expect(findInLibrary(g, [tracked("Chainsaw Man Part 2")])).toBeNull();
    expect(findInLibrary(g, [])).toBeNull();
  });
  it("says nothing is known while the library has not loaded", () => {
    expect(findInLibrary(g, undefined)).toBeNull();
  });
});
