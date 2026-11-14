// Builds the VA disability compensation rate table from VA's own page.
//
//   node scripts/build-va-rates.mjs <veteran-rates.html> <effective-date> <label>
//
// Source: https://www.va.gov/disability/compensation-rates/veteran-rates/
// (send a browser User-Agent and Accept-Encoding: gzip). Re-run each December
// when VA publishes the new rates. Output: data/va/compensation-rates.json

import fs from "node:fs";
import path from "node:path";

const [htmlPath, effective, label] = process.argv.slice(2);
if (!htmlPath || !effective || !label) {
  console.error("usage: node scripts/build-va-rates.mjs <veteran-rates.html> <YYYY-MM-DD> <label>");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const tables = (html.match(/<va-table[\s>][\s\S]*?<\/va-table>/g) ?? []).map((table) =>
  (table.match(/<va-table-row[\s\S]*?<\/va-table-row>/g) ?? []).map((row) =>
    (row.match(/<span[^>]*>[\s\S]*?<\/span>/g) ?? []).map((cell) => cell.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
  )
);

const money = (text) => {
  const value = Number(String(text).replace(/[$,]/g, ""));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`not a dollar amount: "${text}"`);
  return value;
};

// Row label -> key. Order matters: the more specific patterns come first.
const ROW_KEYS = [
  [/1 child, spouse,? and 2 parents/i, "child_spouse_2parents"],
  [/1 child, spouse,? and 1 parent/i, "child_spouse_1parent"],
  [/1 child and spouse/i, "child_spouse"],
  [/1 child and 2 parents/i, "child_2parents"],
  [/1 child and 1 parent/i, "child_1parent"],
  [/with (1 )?child only/i, "child"],
  [/spouse and 2 parents/i, "spouse_2parents"],
  [/spouse and 1 parent/i, "spouse_1parent"],
  [/^with spouse/i, "spouse"],
  [/^with 2 parents/i, "parents2"],
  [/^with 1 parent/i, "parent1"],
  [/veteran alone/i, "alone"],
  [/additional child under/i, "add_child_under18"],
  [/additional child over/i, "add_child_school"],
  [/spouse receiving aid/i, "add_spouse_aid_attendance"],
];

const rates = {};
for (const rows of tables) {
  const header = rows[0] ?? [];
  if (/^disability rating$/i.test(header[0] ?? "")) {
    // 10 and 20 percent: one flat amount, no dependent additions
    for (const row of rows.slice(1)) rates[parseInt(row[0], 10)] = { alone: money(row[1]) };
    continue;
  }
  const ratings = header.slice(1).map((cell) => parseInt(cell, 10));
  if (ratings.some((r) => !Number.isFinite(r))) continue;
  for (const row of rows.slice(1)) {
    const key = ROW_KEYS.find(([pattern]) => pattern.test(row[0]))?.[1];
    if (!key) throw new Error(`unrecognized row: "${row[0]}"`);
    ratings.forEach((rating, index) => {
      rates[rating] ??= {};
      rates[rating][key] = money(row[index + 1]);
    });
  }
}

const expectedKeys = ROW_KEYS.map(([, key]) => key);
for (const rating of [30, 40, 50, 60, 70, 80, 90, 100]) {
  const missing = expectedKeys.filter((key) => rates[rating]?.[key] === undefined);
  if (missing.length) throw new Error(`rating ${rating} is missing: ${missing.join(", ")}`);
}
if (!rates[10]?.alone || !rates[20]?.alone) throw new Error("10 or 20 percent rate missing");

const dir = path.resolve("data/va");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "compensation-rates.json"),
  JSON.stringify(
    {
      label,
      effective,
      unit: "USD per month",
      source: "https://www.va.gov/disability/compensation-rates/veteran-rates/",
      retrieved: new Date().toISOString().slice(0, 10),
      rates,
    },
    null,
    1
  )
);
console.log(`ratings ${Object.keys(rates).join(", ")}; 100 percent alone ${rates[100].alone}`);
