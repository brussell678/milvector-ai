import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { collectFiles, deleteAccount } from "@/lib/account/delete";

const U = "user-1";

type Options = { failRemove?: string; failRpc?: boolean; failAuth?: boolean; failList?: string; missingFn?: boolean };

// A stand-in for the service-role client: storage holds paths per bucket and
// lists them one folder level at a time, the way Supabase Storage does.
function fakeAdmin(storage: Record<string, string[]>, rows: Record<string, Record<string, string | null>[]>, opts: Options = {}) {
  const calls: string[] = [];
  const removed: Record<string, string[]> = {};
  const admin = {
    from(table: string) {
      return {
        select: () => ({
          eq: async () => {
            calls.push(`read ${table}`);
            return { data: rows[table] ?? [], error: null };
          },
        }),
      };
    },
    storage: {
      from(bucket: string) {
        return {
          list: async (prefix: string) => {
            if (opts.failList === bucket) return { data: null, error: { message: "list failed" } };
            const seen = new Map<string, { name: string; id: string | null }>();
            for (const path of storage[bucket] ?? []) {
              if (!path.startsWith(`${prefix}/`)) continue;
              const rest = path.slice(prefix.length + 1);
              const name = rest.split("/")[0];
              seen.set(name, { name, id: rest.includes("/") ? null : `id-${name}` });
            }
            return { data: [...seen.values()], error: null };
          },
          remove: async (paths: string[]) => {
            calls.push(`remove ${bucket} ${paths.length}`);
            if (opts.failRemove === bucket) return { data: null, error: { message: "remove failed" } };
            (removed[bucket] ??= []).push(...paths);
            return { data: [], error: null };
          },
        };
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(`rpc ${fn} ${args.p_user_id}`);
      if (opts.missingFn) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      return { data: null, error: opts.failRpc && args.p_user_id === U ? { message: "rpc failed" } : null };
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          calls.push(`deleteUser ${id}`);
          return { data: null, error: opts.failAuth ? { message: "auth failed" } : null };
        },
      },
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls, removed };
}

const STORAGE = {
  documents: [`${U}/doc-1/fitrep.pdf`, `${U}/doc-2/resume.docx`, `${U}/orphan/old.txt`, "someone-else/doc-9/theirs.pdf"],
  "linkedin-banners": [`${U}/banner-1.png`],
  "library-submissions": [`${U}/sub-1/guide.pdf`],
  "feedback-attachments": ["abc/screenshot.png", "not-theirs/other.png"],
};
const ROWS = {
  documents: [{ storage_path: `${U}/doc-1/fitrep.pdf` }, { storage_path: `${U}/doc-2/resume.docx` }],
  feedback: [{ attachment_url: "abc/screenshot.png" }, { attachment_url: null }],
};

describe("collectFiles", () => {
  it("finds every file the member owns, once, and nobody else's", async () => {
    const { admin } = fakeAdmin(STORAGE, ROWS);
    const files = await collectFiles(admin, U);
    expect(files.documents.sort()).toEqual([`${U}/doc-1/fitrep.pdf`, `${U}/doc-2/resume.docx`, `${U}/orphan/old.txt`]);
    expect(files["linkedin-banners"]).toEqual([`${U}/banner-1.png`]);
    expect(files["library-submissions"]).toEqual([`${U}/sub-1/guide.pdf`]);
    expect(files["feedback-attachments"]).toEqual(["abc/screenshot.png"]);
  });
});

describe("deleteAccount", () => {
  it("checks it is set up, then removes files, then posts and tickets, then the sign-in record", async () => {
    const { admin, calls, removed } = fakeAdmin(STORAGE, ROWS);
    const result = await deleteAccount(admin, U);
    expect(result).toEqual({ ok: true, files: 6 });
    expect(calls[0]).toBe("rpc prepare_account_deletion 00000000-0000-0000-0000-000000000000");
    const steps = calls.slice(1).filter((c) => !c.startsWith("read"));
    expect(steps.slice(-2)).toEqual([`rpc prepare_account_deletion ${U}`, `deleteUser ${U}`]);
    expect(steps.slice(0, -2).every((c) => c.startsWith("remove"))).toBe(true);
    expect(removed.documents).not.toContain("someone-else/doc-9/theirs.pdf");
  });

  it("stops before touching the account when a file can't be removed", async () => {
    const { admin, calls } = fakeAdmin(STORAGE, ROWS, { failRemove: "linkedin-banners" });
    const result = await deleteAccount(admin, U);
    expect(result).toMatchObject({ ok: false, stage: "files" });
    expect(calls.some((c) => c === `rpc prepare_account_deletion ${U}` || c.startsWith("deleteUser"))).toBe(false);
  });

  it("stops before touching anything when files can't be listed", async () => {
    const { admin, calls } = fakeAdmin(STORAGE, ROWS, { failList: "documents" });
    expect(await deleteAccount(admin, U)).toMatchObject({ ok: false, stage: "files" });
    expect(calls.some((c) => c.startsWith("remove") || c === `rpc prepare_account_deletion ${U}` || c.startsWith("deleteUser"))).toBe(false);
  });

  it("stops before reading or removing anything when migration 0040 is missing", async () => {
    const { admin, calls } = fakeAdmin(STORAGE, ROWS, { missingFn: true });
    expect(await deleteAccount(admin, U)).toMatchObject({ ok: false, stage: "setup" });
    expect(calls).toEqual(["rpc prepare_account_deletion 00000000-0000-0000-0000-000000000000"]);
  });

  it("keeps the sign-in record when posts and tickets can't be cleared", async () => {
    const { admin, calls } = fakeAdmin(STORAGE, ROWS, { failRpc: true });
    expect(await deleteAccount(admin, U)).toMatchObject({ ok: false, stage: "records" });
    expect(calls.some((c) => c.startsWith("deleteUser"))).toBe(false);
  });

  it("reports when the sign-in record itself can't be deleted", async () => {
    const { admin } = fakeAdmin(STORAGE, ROWS, { failAuth: true });
    expect(await deleteAccount(admin, U)).toMatchObject({ ok: false, stage: "account" });
  });
});
