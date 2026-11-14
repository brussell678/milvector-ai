// Builds the monthly basic pay table the retirement calculator estimates a
// High-3 average from.
//
//   node scripts/build-pay-data.mjs <primary.html> <second.html> <year> <raisePct>
//
// DFAS and militarypay.defense.gov refuse automated requests, so the table is
// read from two independent published copies of the DFAS chart and every cell
// is compared. Cells that differ by more than the rounding tolerance are
// listed and the build fails unless they are known and explained below.
//
//   primary  https://www.navycs.com/charts/<year>-military-pay-chart.html
//   second   https://themilitarywallet.com/<year>-military-pay-charts/
//
// Values are whole dollars per month. That is precise enough for an estimate;
// the calculator also lets a member type their exact High-3 from their LES.

import fs from "node:fs";
import path from "node:path";

const [primaryPath, secondPath, year, raisePct] = process.argv.slice(2);
if (!primaryPath || !secondPath || !year) {
  console.error("usage: node scripts/build-pay-data.mjs <primary.html> <second.html> <year> <raisePct>");
  process.exit(1);
}

const WORDS = { fewer: 0, less: 0, under: 0, two: 2, three: 3, four: 4, six: 6, eight: 8 };

function yearsFromLabel(label) {
  const lower = label.toLowerCase();
  const digits = lower.match(/\d+/);
  if (/less than|fewer than|under/.test(lower)) return 0;
  if (digits) return Number(digits[0]);
  const word = lower.match(/[a-z]+/);
  return word && word[0] in WORDS ? WORDS[word[0]] : null;
}

function gradeFromLabel(label) {
  if (/less than 4 months/i.test(label)) return null;
  const match = label.replace(/\s+/g, "").match(/^([OWE])-?(\d{1,2})(E)?/i);
  return match ? `${match[1].toUpperCase()}-${match[2]}${match[3] ? "E" : ""}` : null;
}

function parse(file) {
  const html = fs.readFileSync(file, "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const grades = {};
  for (const table of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((row) =>
      (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).flatMap((cell) => {
        const text = cell.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
        // A blank cell spanning several columns (grades that start partway
        // through the table) must keep the later cells in their own columns.
        const span = Number((cell.match(/^<t[dh][^>]*\bcolspan="?(\d+)/i) ?? [])[1] ?? 1);
        return [text, ...Array(Math.max(0, span - 1)).fill("")];
      })
    );
    // The header is the first row whose cells mostly read as years of service.
    const headerIndex = rows.findIndex((row) => row.filter((cell) => yearsFromLabel(cell) !== null && !/\$/.test(cell)).length >= 3);
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    // Some charts put the grade column in the header row, some do not.
    const offset = gradeFromLabel(rows[headerIndex + 1]?.[0] ?? "") && header.length === (rows[headerIndex + 1]?.length ?? 0) - 1 ? 1 : 0;
    const years = header.map((cell) => yearsFromLabel(cell));

    for (const row of rows.slice(headerIndex + 1)) {
      const grade = gradeFromLabel(row[0] ?? "");
      if (!grade) continue;
      grades[grade] ??= {};
      row.slice(1).forEach((cell, index) => {
        const yos = offset ? years[index] : years[index + 1];
        const amount = cell.match(/^\$?([\d,]+)(?:\.\d+)?$/);
        if (yos === null || yos === undefined || !amount) return;
        grades[grade][yos] = Number(amount[1].replace(/,/g, ""));
      });
    }
  }
  return grades;
}

const primary = parse(primaryPath);
const second = parse(secondPath);

// Known, explained differences between the two copies.
// O-7 to O-10 basic pay is capped at Executive Schedule Level II. The primary
// source shows the capped figure that DFAS pays; the second shows uncapped.
const CAP_GRADES = new Set(["O-7", "O-8", "O-9", "O-10"]);
const TOLERANCE = 2; // dollars: the two copies round the cents differently

// Cells where the two copies disagree and the right value was established
// separately. Keyed "<year>|<grade>|<years of service>". A new year's build
// fails on any disagreement until it is investigated and recorded here.
const RESOLVED = {
  "2026|E-1|0": { value: 2407, reason: "Second source lists the under-4-months E-1 rate; 2407 is E-1 with 4 months or more." },
  "2026|E-5|8": { value: 4300, reason: "Second source is wrong. A third source (vetcalc.org) gives 4,299.90." },
  "2026|O-8|18": {
    value: 17912,
    reason: "Primary repeats the over-20 figure. 2025's 17,256.30 plus the 3.8 percent raise is 17,912, matching the second source.",
  },
};

let compared = 0;
const unexplained = [];
const corrections = [];
for (const [grade, cells] of Object.entries(primary)) {
  for (const [yos, amount] of Object.entries(cells)) {
    const other = second[grade]?.[yos];
    if (other === undefined) continue;
    compared += 1;
    if (Math.abs(other - amount) <= TOLERANCE) continue;
    const resolved = RESOLVED[`${year}|${grade}|${yos}`];
    if (resolved) {
      if (resolved.value !== amount) {
        cells[yos] = resolved.value;
        corrections.push(`${grade} over ${yos}: ${amount} corrected to ${resolved.value}. ${resolved.reason}`);
      }
      continue;
    }
    if (CAP_GRADES.has(grade) && other > amount) continue;
    unexplained.push(`${grade} over ${yos}: ${amount} vs ${other}`);
  }
}

const gradeOrder = (g) => ({ E: 0, W: 1, O: 2 })[g[0]] * 100 + Number(g.match(/\d+/)[0]) + (g.endsWith("E") ? 0.5 : 0);
const sorted = Object.fromEntries(Object.entries(primary).sort((a, b) => gradeOrder(a[0]) - gradeOrder(b[0])));

console.log(`grades ${Object.keys(sorted).length}, cells ${Object.values(sorted).reduce((n, c) => n + Object.keys(c).length, 0)}, cross-checked ${compared}`);
if (unexplained.length) {
  console.error(`UNEXPLAINED DIFFERENCES (${unexplained.length}):\n  ${unexplained.join("\n  ")}`);
  process.exit(1);
}

const dir = path.resolve("data/pay");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, `basic-pay-${year}.json`),
  JSON.stringify(
    {
      year: Number(year),
      effective: `${year}-01-01`,
      raisePct: raisePct ? Number(raisePct) : null,
      unit: "USD per month, whole dollars",
      authority: "DFAS monthly basic pay table",
      source: "https://www.navycs.com/charts/" + year + "-military-pay-chart.html",
      crossCheckedWith: "https://themilitarywallet.com/" + year + "-military-pay-charts/",
      crossCheckedCells: compared,
      note: "O-7 and above are capped at Executive Schedule Level II.",
      corrections,
      builtAt: new Date().toISOString().slice(0, 10),
      grades: sorted,
    },
    null,
    1
  )
);
