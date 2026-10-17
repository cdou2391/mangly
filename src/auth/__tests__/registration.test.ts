import { passwordProblem, utf8Bytes, validateRegistration } from "../registration";

const form = (over: Partial<{ full_name: string; email: string; password: string }> = {}) => ({
  full_name: "Ada Lovelace", email: "ada@example.com", password: "analytic1", ...over,
});
const errors = (over = {}) => {
  const r = validateRegistration(form(over));
  return r.ok ? {} : r.errors;
};

describe("utf8Bytes", () => {
  it("counts ASCII as one byte each, and other characters as more", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("é")).toBe(2);
    expect(utf8Bytes("€")).toBe(3);
    expect(utf8Bytes("😀")).toBe(4); // one character, two UTF-16 units
    expect(utf8Bytes("")).toBe(0);
  });
});

describe("validateRegistration", () => {
  it("accepts a good form and returns it trimmed", () => {
    const r = validateRegistration(form({ full_name: "  Ada  ", email: " ada@example.com " }));
    expect(r).toEqual({ ok: true, data: { full_name: "Ada", email: "ada@example.com", password: "analytic1" } });
  });

  it("keeps the email's case: the server lowercases it, and signing in does too", () => {
    const r = validateRegistration(form({ email: "Ada.Lovelace@Example.COM" }));
    expect(r.ok && r.data.email).toBe("Ada.Lovelace@Example.COM");
  });

  it("asks for a name, and not just spaces", () => {
    expect(errors({ full_name: "" }).full_name).toBe("Enter your name.");
    expect(errors({ full_name: "   " }).full_name).toBe("Enter your name.");
    expect(errors({ full_name: "x".repeat(256) }).full_name).toBe("That name is too long.");
  });

  it("asks for a valid email", () => {
    for (const bad of ["", "ada", "ada@", "@example.com", "ada example@x.com"]) expect(errors({ email: bad }).email).toBe("Enter a valid email.");
  });

  it("gives one message per field: the first rule broken, not the last", () => {
    expect(errors({ password: "abc" }).password).toBe("At least 8 characters."); // also has no number, but length comes first
    expect(errors({ password: "abcdefgh" }).password).toBe("Include a number.");
    expect(errors({ password: "12345678" }).password).toBe("Include a letter.");
  });

  it("allows exactly 8 and exactly 72 characters, and refuses 73", () => {
    expect(errors({ password: "abcdefg1" }).password).toBeUndefined();
    expect(errors({ password: "a".repeat(71) + "1" }).password).toBeUndefined();
    expect(errors({ password: "a".repeat(72) + "1" }).password).toBe("At most 72 characters.");
  });

  it("refuses a password that fits in 72 characters but not in 72 bytes, which the server cannot hash", () => {
    const accented = "é".repeat(40) + "a1"; // 42 characters, 82 bytes
    expect(errors({ password: accented }).password).toMatch(/Too long/);
    expect(errors({ password: "é".repeat(35) + "a1" }).password).toBeUndefined(); // 37 characters, 72 bytes
    expect(errors({ password: "😀".repeat(17) + "a1" }).password).toBeUndefined(); // 19 characters, 70 bytes
    expect(errors({ password: "😀".repeat(18) + "a1" }).password).toMatch(/Too long/); // 20 characters, 74 bytes
  });

  it("reports every field at once", () => {
    const r = validateRegistration({ full_name: "", email: "x", password: "" });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.ok ? {} : r.errors).sort()).toEqual(["email", "full_name", "password"]);
  });
});

describe("passwordProblem", () => {
  it("is null for an acceptable password", () => {
    expect(passwordProblem("analytic1")).toBeNull();
    expect(passwordProblem("a".repeat(71) + "1")).toBeNull();
  });
  it("says the first rule broken, in the words sign-up uses", () => {
    expect(passwordProblem("short1")).toBe("At least 8 characters.");
    expect(passwordProblem("12345678")).toBe("Include a letter.");
    expect(passwordProblem("abcdefgh")).toBe("Include a number.");
    expect(passwordProblem("a1".repeat(37))).toBe("At most 72 characters.");
    expect(passwordProblem("é1".repeat(30))).toMatch(/72 bytes/);
    expect(passwordProblem("")).toBe("At least 8 characters.");
  });
});
