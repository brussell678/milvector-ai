// Publishes new WHATSNEW.md entries to the product_updates table.
// Runs in CI (see .github/workflows/whatsnew.yml). Dependency-free: uses the
// Supabase REST API with the project's secret key.
//
// An entry tagged {draft} goes in unpublished: it waits on the admin portal
// (/app/admin and /app/admin/updates) until the admin publishes it there, and
// members see nothing before that.
//
// Only entries that are new in this push are added (BEFORE_SHA is the commit
// main pointed at before the push), so a draft the admin deletes or retitles
// on the portal stays that way. Entries already in the table, matched by
// title, are skipped as well, so re-runs are safe. A manual run (no
// BEFORE_SHA) adds every entry that is not in the table yet.
//
// Local dry run (no network, just prints what it parsed):
//   node scripts/publish-whatsnew.mjs --dry-run

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORIES = new Set(["new", "improvement", "fix"]);

/** @typedef {{ title: string, category: string, requested: boolean, draft: boolean, body: string }} Entry */

/**
 * Parses WHATSNEW.md into entries, newest first.
 * @param {string} markdown
 * @returns {Entry[]}
 */
export function parseEntries(markdown) {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.split(/\r?\n/);
  const entries = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const body = current.bodyLines.join("\n").trim();
    if (current.title && body) {
      entries.push({ title: current.title, category: current.category, requested: current.requested, draft: current.draft, body });
    }
    current = null;
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      flush();
      const text = heading[1];
      const tags = [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim().toLowerCase());
      let category = "improvement";
      for (const tag of tags) if (CATEGORIES.has(tag)) category = tag;
      current = {
        title: text.replace(/\{[^}]+\}/g, "").trim(),
        category,
        requested: tags.includes("requested"),
        draft: tags.includes("draft"),
        bodyLines: [],
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush();
  return entries;
}

/**
 * Entries to add: new in this push (absent from the previous file, when there
 * is one) and not already in the table.
 * @param {Entry[]} entries
 * @param {{ previousEntries?: Entry[] | null, existingTitles?: string[] }} [options]
 * @returns {Entry[]}
 */
export function entriesToAdd(entries, { previousEntries = null, existingTitles = [] } = {}) {
  const key = (title) => String(title ?? "").trim().toLowerCase();
  const before = previousEntries ? new Set(previousEntries.map((e) => key(e.title))) : null;
  const seen = new Set(existingTitles.map(key));
  return entries.filter((e) => !seen.has(key(e.title)) && (!before || !before.has(key(e.title))));
}

/**
 * Table rows for the entries; file order is newest first, so the top entry gets the latest time.
 * @param {Entry[]} entries
 * @param {number} [now]
 */
export function toRows(entries, now = Date.now()) {
  return entries.map((e, index) => ({
    title: e.title,
    body: e.body,
    category: e.category,
    is_user_requested: e.requested,
    published: !e.draft,
    published_at: new Date(now - index * 1000).toISOString(),
  }));
}

function previousFile(beforeSha) {
  if (!beforeSha || /^0+$/.test(beforeSha)) return null;
  try {
    return execFileSync("git", ["show", `${beforeSha}:WHATSNEW.md`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // The file did not exist before this push, or that commit is not fetched.
    return "";
  }
}

async function main() {
  const DRY_RUN = process.argv.includes("--dry-run");
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
  const markdown = readFileSync(new URL("../WHATSNEW.md", import.meta.url), "utf8");
  const entries = parseEntries(markdown);

  if (entries.length === 0) {
    console.log("No entries found in WHATSNEW.md.");
    return;
  }

  if (DRY_RUN) {
    console.log(`Parsed ${entries.length} entr${entries.length === 1 ? "y" : "ies"}:`);
    for (const e of entries) console.log(`  - [${e.category}${e.requested ? ", requested" : ""}${e.draft ? ", draft" : ""}] ${e.title}`);
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log(
      "::warning::SUPABASE_URL or SUPABASE_SECRET_KEY is not set. Skipping publish. Add them as GitHub Actions secrets to enable auto-publishing."
    );
    return;
  }

  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
  };

  const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/product_updates?select=title`, { headers });
  if (!existingRes.ok) {
    console.log(`::error::Could not read existing updates (HTTP ${existingRes.status}).`);
    process.exit(1);
  }
  const existing = await existingRes.json();

  const before = previousFile(process.env.BEFORE_SHA);
  const fresh = entriesToAdd(entries, {
    previousEntries: before === null ? null : parseEntries(before),
    existingTitles: existing.map((row) => row.title),
  });
  if (fresh.length === 0) {
    console.log("Nothing new to add. Every entry in this push is already in the table.");
    return;
  }

  const rows = toRows(fresh);
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/product_updates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });

  if (!insertRes.ok) {
    const detail = await insertRes.text();
    console.log(`::error::Failed to add updates (HTTP ${insertRes.status}): ${detail}`);
    process.exit(1);
  }

  const published = rows.filter((r) => r.published).map((r) => r.title);
  const drafts = rows.filter((r) => !r.published).map((r) => r.title);
  if (published.length) console.log(`Published ${published.length}: ${published.join(" | ")}`);
  if (drafts.length) console.log(`Added ${drafts.length} draft(s) for the admin to publish: ${drafts.join(" | ")}`);
}

// Run only when executed (CI or a dry run), not when a test imports it.
const self = path.resolve(fileURLToPath(import.meta.url));
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (process.platform === "win32" ? self.toLowerCase() === invoked.toLowerCase() : self === invoked) {
  main().catch((err) => {
    console.log(`::error::${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
