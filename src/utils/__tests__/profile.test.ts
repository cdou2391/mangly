import { initials, memberSince } from "../profile";

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  ada   king  lovelace ")).toBe("AL");
  });
  it("uses one letter for one word, in capitals", () => {
    expect(initials("ada")).toBe("A");
  });
  it("copes with names in other scripts and with emoji", () => {
    expect(initials("進撃 巨人")).toBe("進巨");
    expect(initials("😀 Ada")).toBe("😀A");
  });
  it("falls back to a question mark when there is no name", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
  });
});

describe("memberSince", () => {
  it("gives the month and year", () => {
    expect(memberSince(new Date(2026, 9, 14, 12).toISOString())).toBe("Oct 2026");
    expect(memberSince(new Date(2024, 0, 31, 12).toISOString())).toBe("Jan 2024");
  });
  it("is empty when the date is missing or invalid", () => {
    expect(memberSince("")).toBe("");
    expect(memberSince(null)).toBe("");
    expect(memberSince("soon")).toBe("");
  });
});
