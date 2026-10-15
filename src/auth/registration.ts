import { z } from "zod";

/** Bytes in the UTF-8 encoding of a string. The server hashes passwords with bcrypt, which only accepts 72 bytes. */
export function utf8Bytes(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

// Mirrors the backend rules: min length, at least one letter and one digit, and at most 72 bytes (bcrypt).
// The server counts characters, so an accented or emoji password that fits in 72 characters but not 72 bytes gets a
// server error instead of an explanation; it is caught here.
const schema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(255, "That name is too long."),
  email: z.string().trim().email("Enter a valid email."),
  password: z
    .string()
    .min(8, "At least 8 characters.")
    .max(72, "At most 72 characters.")
    .refine((p) => utf8Bytes(p) <= 72, "Too long. Accented letters and emoji count extra (72 bytes at most).")
    .regex(/[A-Za-z]/, "Include a letter.")
    .regex(/\d/, "Include a number."),
});

export type RegistrationForm = z.infer<typeof schema>;

export type RegistrationResult = { ok: true; data: RegistrationForm } | { ok: false; errors: Record<string, string> };

/** Checks the form; on failure there is one message per field, the first rule it broke. */
export function validateRegistration(form: { full_name: string; email: string; password: string }): RegistrationResult {
  const parsed = schema.safeParse(form);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
