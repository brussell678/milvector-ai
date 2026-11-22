import { describe, expect, it } from "vitest";
import { afterSignIn, safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps a path on this site, with its query and hash", () => {
    expect(safeNext("/app/tools/resume-targeter?jd=abc#fit")).toBe("/app/tools/resume-targeter?jd=abc#fit");
    expect(safeNext("/auth?mode=update-password")).toBe("/auth?mode=update-password");
    expect(safeNext("/app/message-board")).toBe("/app/message-board");
  });

  it("refuses anything that would leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/%0d%0aLocation: https://evil.example".replace("%0d%0a", "\r\n"),
      " //evil.example",
    ]) {
      expect(safeNext(bad), bad).toBe("/app");
    }
  });

  it("falls back when there is nothing usable", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext(undefined)).toBe("/app");
    expect(safeNext("")).toBe("/app");
    expect(safeNext("/" + "a".repeat(600))).toBe("/app");
    expect(safeNext("https://evil.example", "/welcome")).toBe("/welcome");
  });
});

describe("afterSignIn", () => {
  it("never sends a signed-in member back to the sign-in page", () => {
    expect(afterSignIn("/auth")).toBe("/app");
    expect(afterSignIn("/auth?mode=signup")).toBe("/app");
    expect(afterSignIn("/auth/confirm?code=x")).toBe("/app");
    expect(afterSignIn("/app/timeline")).toBe("/app/timeline");
    expect(afterSignIn("https://evil.example")).toBe("/app");
  });
});
