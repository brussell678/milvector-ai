// Publishes new WHATSNEW.md entries to the product_updates table.
// Runs in CI (see .github/workflows/whatsnew.yml). Dependency-free: uses the
// Supabase REST API with the project's secret key. Idempotent — entries already
// in the table (matched by title) are skipped, so re-runs are safe.
//
// Local dry run (no network, just prints what it parsed):
//   node scripts/publish-whatsnew.mjs --dry-run

import { readFileSync } from "node:fs";

const CATEGORIES = new Set(["new", "improvement", "fix"]);
const DRY_RUN = process.argv.includes("--dry-run");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function parseEntries(markdown) {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const lines = withoutComments.split(/\r?\n/);
  const entries = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const body = current.bodyLines.join("\n").trim();
    if (current.title && body) {
      entries.push({ title: current.title, category: current.category, requested: current.requested, body });
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
        bodyLines: [],
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush();
  return entries;
}

async function main() {
  const markdown = readFileSync(new URL("../WHATSNEW.md", import.meta.url), "utf8");
  const entries = parseEntries(markdown);

  if (entries.length === 0) {
    console.log("No entries found in WHATSNEW.md.");
    return;
  }

  if (DRY_RUN) {
    console.log(`Parsed ${entries.length} entr${entries.length === 1 ? "y" : "ies"}:`);
    for (const e of entries) console.log(`  - [${e.category}${e.requested ? ", requested" : ""}] ${e.title}`);
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log(
      "::warning::SUPABASE_URL or SUPABASE_SECRET_KEY is not set — skipping publish. Add them as GitHub Actions secrets to enable auto-publishing."
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
  const seen = new Set(existing.map((row) => String(row.title ?? "").trim().toLowerCase()));

  const fresh = entries.filter((e) => !seen.has(e.title.toLowerCase()));
  if (fresh.length === 0) {
    console.log("Nothing new to publish — all entries already live.");
    return;
  }

  // File order is newest-first; give the topmost entry the latest timestamp.
  const now = Date.now();
  const rows = fresh.map((e, index) => ({
    title: e.title,
    body: e.body,
    category: e.category,
    is_user_requested: e.requested,
    published: true,
    published_at: new Date(now - index * 1000).toISOString(),
  }));

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/product_updates`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });

  if (!insertRes.ok) {
    const detail = await insertRes.text();
    console.log(`::error::Failed to publish updates (HTTP ${insertRes.status}): ${detail}`);
    process.exit(1);
  }

  console.log(`Published ${rows.length} new update(s): ${rows.map((r) => r.title).join(" | ")}`);
}

main().catch((err) => {
  console.log(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
