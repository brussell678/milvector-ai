// Builds the VA rating reference data the Rating Navigator is grounded on.
//
//   node scripts/build-va-rating-data.mjs <title38-part4.xml> <dbq-list.html> <as-of-date>
//
// Inputs (public, official):
//   38 CFR Part 4 XML  https://www.ecfr.gov/api/versioner/v1/full/<date>/title-38.xml?part=4
//                      (send Accept-Encoding: gzip; <date> is the latest issue date from
//                      https://www.ecfr.gov/api/versioner/v1/titles.json)
//   DBQ list HTML      https://www.benefits.va.gov/compensation/dbq_publicdbqs.asp
//
// Outputs:
//   data/va/cfr38-part4.json   sections, rating tables, and one entry per diagnostic code
//   data/va/dbq-forms.json     public DBQ form titles and links
//
// Re-run whenever VA amends the rating schedule. The Navigator shows the as-of
// date to users, so a stale file is visible rather than silent.

import fs from "node:fs";
import path from "node:path";

const [xmlPath, dbqPath, asOf] = process.argv.slice(2);
if (!xmlPath || !dbqPath || !asOf) {
  console.error("usage: node scripts/build-va-rating-data.mjs <part4.xml> <dbq-list.html> <YYYY-MM-DD>");
  process.exit(1);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function plain(fragment) {
  return decode(fragment.replace(/<[^>]+>/g, " "))
    .replace(/[ -​ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const xml = fs.readFileSync(xmlPath, "utf8");

const sections = [];
const tables = [];
const codes = [];

const FORMULA_RE = /^((General )?Rating Formula|Formula for Rating)\b/i;

const sectionRe =/<DIV8 N="([^"]+)" TYPE="SECTION"[^>]*>([\s\S]*?)<\/DIV8>/g;
for (const match of xml.matchAll(sectionRe)) {
  const number = match[1];
  const body = match[2];
  const heading = plain((body.match(/<HEAD>([\s\S]*?)<\/HEAD>/) ?? ["", ""])[1]);

  // Prose outside the tables
  const prose = [...body.replace(/<TABLE[\s\S]*?<\/TABLE>/g, " ").matchAll(/<P[^>]*>([\s\S]*?)<\/P>/g)]
    .map((p) => plain(p[1]))
    .filter(Boolean);

  const sectionTables = [];
  for (const tableMatch of body.matchAll(/<TABLE[\s\S]*?<\/TABLE>/g)) {
    const tableXml = tableMatch[0];
    const caption = plain((tableXml.match(/<CAPTION>([\s\S]*?)<\/CAPTION>/) ?? ["", ""])[1]);
    const tableId = tables.length;
    const rows = [];
    for (const rowMatch of tableXml.matchAll(/<TR[^>]*>([\s\S]*?)<\/TR>/g)) {
      const cells = [...rowMatch[1].matchAll(/<T[DH][^>]*?(?:\/>|>([\s\S]*?)<\/T[DH]>)/g)].map((c) => plain(c[1] ?? ""));
      if (cells.some(Boolean)) rows.push(cells);
    }
    const table = { id: tableId, section: number, caption, rows, blocks: 0 };
    tables.push(table);
    sectionTables.push(tableId);

    // Walk the rows into blocks. A row that opens with a four-digit diagnostic
    // code starts that code's block; a "General Rating Formula" row starts a
    // formula block shared by the codes in the same table.
    // A table whose caption is itself a formula (mental disorders, eating
    // disorders) opens a formula block before the first row.
    let current = FORMULA_RE.test(caption)
      ? { kind: "formula", code: null, title: caption, section: number, table: tableId, lines: [] }
      : null;
    const flush = () => {
      if (current) {
        codes.push(current);
        table.blocks += 1;
      }
      current = null;
    };
    for (const cells of rows) {
      const first = cells[0] ?? "";
      const rating = cells.length > 1 ? cells[cells.length - 1] : "";
      const codeMatch = first.match(/^(\d{4})\s+(.*)$/);
      const isFormula = FORMULA_RE.test(first);

      if (codeMatch) {
        flush();
        current = { kind: "code", code: codeMatch[1], title: codeMatch[2].replace(/[:.]\s*$/, ""), section: number, table: tableId, lines: [] };
        if (/^\d{1,3}$/.test(rating)) current.lines.push({ text: codeMatch[2], rating: Number(rating) });
        continue;
      }
      if (isFormula) {
        flush();
        current = { kind: "formula", code: null, title: first.replace(/[:.]\s*$/, ""), section: number, table: tableId, lines: [] };
        continue;
      }
      if (!current) continue;
      if (!first) continue;
      current.lines.push(/^\d{1,3}$/.test(rating) ? { text: first, rating: Number(rating) } : { text: first });
    }
    flush();
  }

  // Codes listed as plain paragraphs outside any table (mental disorders,
  // eating disorders). They carry no criteria of their own: the section's
  // rating formula applies.
  const outsideTables = body.replace(/<TABLE[\s\S]*?<\/TABLE>/g, " ");
  for (const listed of outsideTables.matchAll(/<(?:FP(?:-\d)?|P)[^>]*>\s*(\d{4})\s+([^<]+)</g)) {
    const title = plain(listed[2]);
    if (/^\[Removed\]/i.test(title)) continue;
    codes.push({ kind: "code", code: listed[1], title: title.replace(/[:.]\s*$/, ""), section: number, table: null, lines: [] });
  }

  sections.push({ number, heading, prose, tables: sectionTables });
}

// A code can appear in more than one table (cross references). Keep the entry
// with the most criteria lines as the primary and note the rest.
const byCode = new Map();
const formulas = [];
for (const block of codes) {
  if (block.kind === "formula") {
    formulas.push(block);
    continue;
  }
  const existing = byCode.get(block.code);
  if (!existing || block.lines.length > existing.lines.length) byCode.set(block.code, block);
}

// Hearing impairment has no code row: it is rated from audiometry through the
// grids in 4.85 and 4.86 (Tables VI, VIA, and VII), so its criteria are prose.
if (!byCode.has("6100")) {
  const hearing = sections.filter((s) => s.number === "4.85" || s.number === "4.86");
  byCode.set("6100", {
    kind: "code",
    code: "6100",
    title: "Hearing impairment",
    section: "4.85",
    table: null,
    lines: hearing.flatMap((s) => s.prose.map((text) => ({ text }))),
  });
}

const diagnosticCodes = [...byCode.values()]
  .sort((a, b) => a.code.localeCompare(b.code))
  .map((block) => ({
    code: block.code,
    title: block.title,
    section: block.section,
    table: block.table,
    lines: block.lines,
    ratings: [...new Set(block.lines.map((l) => l.rating).filter((r) => r !== undefined))].sort((a, b) => a - b),
  }));

const out = {
  source: "38 CFR Part 4, Schedule for Rating Disabilities (eCFR)",
  sourceUrl: "https://www.ecfr.gov/current/title-38/chapter-I/part-4",
  asOf,
  builtAt: new Date().toISOString().slice(0, 10),
  sections,
  tables: tables.map(({ id, section, caption }) => ({ id, section, caption })),
  formulas: formulas.map((f) => ({
    title: f.title,
    section: f.section,
    table: f.table,
    lines: f.lines,
    ratings: [...new Set(f.lines.map((l) => l.rating).filter((r) => r !== undefined))].sort((a, b) => a - b),
  })),
  diagnosticCodes,
  // Tables with no code rows: shared criteria that codes point to by name
  // ("rate as voiding dysfunction") and the hearing grids. The combined
  // ratings table in 4.25 is left out because the app computes it.
  sharedTables: tables
    .filter((t) => t.blocks === 0 && t.section !== "4.25")
    .map((t) => ({ id: t.id, section: t.section, caption: t.caption, text: t.rows.map((r) => r.filter(Boolean).join(" | ")).join("\n") })),
};

// ---- DBQ forms
const dbqHtml = fs.readFileSync(dbqPath, "utf8");
const seen = new Set();
const dbqForms = [];
for (const m of dbqHtml.matchAll(/href="([^"]+\.pdf)"[^>]*>([^<]+)</gi)) {
  const href = m[1];
  const title = plain(m[2]);
  if (!/\/compensation\/docs\//i.test(href)) continue;
  if (/implementation-plan|Guidance/i.test(href) || !title) continue;
  const url = new URL(href, "https://www.benefits.va.gov").toString();
  if (seen.has(url)) continue;
  seen.add(url);
  dbqForms.push({ title, url });
}

const dir = path.resolve("data/va");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "cfr38-part4.json"), JSON.stringify(out));
fs.writeFileSync(
  path.join(dir, "dbq-forms.json"),
  JSON.stringify({ source: "https://www.benefits.va.gov/compensation/dbq_publicdbqs.asp", retrieved: out.builtAt, forms: dbqForms }, null, 1)
);

console.log(`sections ${sections.length}, tables ${tables.length}, codes ${diagnosticCodes.length}, formulas ${out.formulas.length}, dbq forms ${dbqForms.length}`);
