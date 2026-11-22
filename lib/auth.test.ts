import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { authReplies, SESSION_ENDED } from "./auth";

describe("authReplies", () => {
  it("sends the reply a sign-in check threw, instead of an empty 500", async () => {
    const handler = authReplies(async () => {
      throw NextResponse.json({ error: SESSION_ENDED }, { status: 401 });
    });
    const res = await handler();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: SESSION_ENDED });
  });

  it("passes a normal reply through and keeps the route's arguments", async () => {
    const handler = authReplies(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => NextResponse.json({ id: (await ctx.params).id }));
    const res = await handler(new Request("http://x/api"), { params: Promise.resolve({ id: "abc" }) });
    expect(await res.json()).toEqual({ id: "abc" });
  });

  it("lets any other error through unchanged", async () => {
    const handler = authReplies(async () => {
      throw new Error("boom");
    });
    await expect(handler()).rejects.toThrow("boom");
  });
});
