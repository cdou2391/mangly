import { ApiError } from "./client";

/** A message a person can act on, for any error the API client can throw. */
export function describeError(error: unknown, what: "search" | "track" | "register"): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return what === "register" ? "Too many attempts. Wait a minute and try again." : "You're doing that too fast. Wait a moment and try again.";
    }
    if (error.status === 0) return error.message; // offline or timed out: already worded for the user
    if (error.status >= 500) {
      if (what === "register") return "We couldn't create your account right now. Try again in a moment.";
      return what === "search"
        ? "The search service had a problem. Try again in a moment."
        : "Couldn't add it right now. The source site may be down, so try again in a moment.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
