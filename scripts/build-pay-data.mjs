// Builds one year's monthly basic pay table for the retirement calculator's
// High-3 average.
//
//   node scripts/build-pay-data.mjs <year> <raisePct> <fedpayscale.html> <navycs.html> <militarywallet.html>
//
// DFAS and militarypay.defense.gov refuse automated requests, so the table is
// read from three independent published copies of the DFAS chart:
//
//   cents   https://fedpayscale.org/military/<year>/
//   check   https://www.navycs.com/charts/<year>-military-pay-chart.html
//   check   https://themilitarywallet.com/<year>-military-pay-charts/
//
// Every cell is taken to the cent from fedpayscale.org, and only when at least
// one of the other two copies agrees with it within a dollar. The copies have
// each been wrong somewhere (a repeated cell, another year's row, a dollar off,
// the under-4-months E-1 rate, the April 2025 junior enlisted raise, uncapped
// officer pay), so a cell no second copy confirms fails the build until it is
// investigated and recorded in RESOLVED.
//
// Before comparing, every copy is held to the statutory ceiling
// (37 U.S.C. 203(a)(2)): O-7 to O-10 may not exceed Executive Schedule Level
// II, every other grade Level V. Add each year's Executive Schedule from OPM:
//   https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/salary-tables/<yy>Tables/exec/html/EX.aspx

import fs from "node:fs";
import path from "node:path";

const [year, raisePct, centsPath, navycsPath, walletPath] = process.argv.slice(2);
if (!year || !centsPath || !navycsPath || !walletPath) {
  console.error("usage: node scripts/build-pay-data.mjs <year> <raisePct> <fedpayscale.html> <navycs.html> <militarywallet.html>");
  process.exit(1);
}

// Annual Executive Schedule rates, from OPM's table for each year.
const EXECUTIVE_SCHEDULE = {
  2023: { levelII: 212100, levelV: 172100 },
  2024: { levelII: 221900, levelV: 180000 },
  2025: { levelII: 225700, levelV: 183100 },
  2026: { levelII: 228000, levelV: 184900 },
};
const schedule = EXECUTIVE_SCHEDULE[year];
if (!schedule) {
  console.error(`No Executive Schedule for ${year}. Add Level II and Level V from OPM's ${year} EX table first.`);
  process.exit(1);
}
const GENERAL_OFFICER = new Set(["O-7", "O-8", "O-9", "O-10"]);
const ceiling = (grade) => (GENERAL_OFFICER.has(grade) ? schedule.levelII : schedule.levelV) / 12;

// Cells no second copy confirms, where the right value was established
// separately. Keyed "<year>|<grade>|<years of service>", value in dollars.
const RESOLVED = {};

const AGREE = 1; // dollars: navycs shows whole dollars, truncated

const WORDS = { fewer: 0, less: 0, under: 0, two: 2, three: 3, four: 4, six: 6, eight: 8 };

function yearsFromLabel(label) {
  const lower = label.toLowerCase();
  const digits = lower.match(/\d+/);
  if (/less than|fewer than|under|^<\s*2$/.test(lower)) return 0;
  if (digits) return Number(digits[0]);
  const word = lower.match(/[a-z]+/);
  return word && word[0] in WORDS ? WORDS[word[0]] : null;
}

function gradeFromLabel(label) {
  if (/less than 4 months/i.test(label)) return null;
  const match = label.replace(/\s+/g, "").match(/^([OWE])-?(\d{1,2})(E)?/i);
  return match ? `${match[1].toUpperCase()}-${match[2]}${match[3] ? "E" : ""}` : null;
}

function readTables(file) {
  // Attribute values on some pages contain ">", so drop class and style first.
  const html = fs
    .readFileSync(file, "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/\s(class|style)="[^"]*"/g, "");
  return (html.match(/<table[\s\S]*?<\/table>/g) ?? []).map((table) =>
    (table.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((row) =>
      (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).flatMap((cell) => {
        const text = cell.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").trim();
        // A blank cell spanning several columns (grades that start partway
        // through the table) must keep the later cells in their own columns.
        const span = Number((cell.match(/^<t[dh][^>]*\bcolspan="?(\d+)/i) ?? [])[1] ?? 1);
        return [text, ...Array(Math.max(0, span - 1)).fill("")];
      })
    )
  );
}

const money = (cell) => {
  const match = cell.match(/^\$?([\d,]+(?:\.\d+)?)$/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
};

// Grades down the side, years of service across the top (navycs, militarywallet).
function parseByGrade(file) {
  const grades = {};
  for (const rows of readTables(file)) {
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
        const amount = money(cell);
        if (yos === null || yos === undefined || amount === null) return;
        grades[grade][yos] = amount;
      });
    }
  }
  return grades;
}

// Years of service down the side, grades across the top (fedpayscale).
function parseByYears(file) {
  const grades = {};
  for (const rows of readTables(file)) {
    const headerIndex = rows.findIndex((row) => row.filter((cell) => /^[OWE]-\d{1,2}E?$/.test(cell)).length >= 3);
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    for (const row of rows.slice(headerIndex + 1)) {
      const yos = yearsFromLabel(row[0] ?? "");
      if (yos === null) continue;
      row.forEach((cell, index) => {
        const amount = money(cell);
        const grade = header[index];
        if (index === 0 || amount === null || !/^[OWE]-\d{1,2}E?$/.test(grade ?? "")) return;
        (grades[grade] ??= {})[yos] = amount;
      });
    }
  }
  return grades;
}

const capped = (grades) => {
  for (const [grade, cells] of Object.entries(grades)) for (const yos of Object.keys(cells)) cells[yos] = Math.min(cells[yos], ceiling(grade));
  return grades;
};

// fedpayscale prints DFAS's own capped figures (18,491.70 for 2024's Level II,
// for example), so its value is only capped when it sits clearly above the
// ceiling. The other two copies are capped outright before comparing.
const cents = parseByYears(centsPath);
const navycs = capped(parseByGrade(navycsPath));
const wallet = capped(parseByGrade(walletPath));

const result = {};
const dissents = [];
const unconfirmed = [];
const repeats = new Set();
let cellCount = 0;
for (const [grade, cells] of Object.entries(cents)) {
  let previous = null;
  // Integer-like keys iterate in ascending order: steps from fewest years up.
  for (const [yos, raw] of Object.entries(cells)) {
    cellCount += 1;
    const amount = raw > ceiling(grade) + AGREE ? ceiling(grade) : raw;
    if (amount !== raw) dissents.push(`${grade} over ${yos}: fedpayscale shows ${raw}, above the ceiling`);
    const resolved = RESOLVED[`${year}|${grade}|${yos}`];
    const checks = [
      ["navycs", navycs[grade]?.[yos]],
      ["militarywallet", wallet[grade]?.[yos]],
    ];
    const agreeing = checks.filter(([, value]) => value !== undefined && Math.abs(value - amount) <= AGREE);
    let value = Math.round(amount * 100) / 100;
    if (resolved) value = resolved.value;
    else if (!agreeing.length) {
      // fedpayscale lists every step to 40 years; the other copies stop where
      // pay stops changing. A step that only repeats the confirmed step before
      // it is left out: a lookup past it reads that same earlier step.
      if (previous !== null && Math.abs(amount - previous) <= AGREE) {
        repeats.add(`${grade}|${yos}`);
        continue;
      }
      unconfirmed.push(`${grade} over ${yos}: fedpayscale ${raw}, navycs ${checks[0][1] ?? "none"}, militarywallet ${checks[1][1] ?? "none"}`);
      continue;
    }
    for (const [name, other] of checks) {
      if (other !== undefined && Math.abs(other - value) > AGREE) dissents.push(`${grade} over ${yos}: ${name} shows ${other}`);
    }
    (result[grade] ??= {})[yos] = value;
    previous = value;
  }
}

// Every grade and step either copy shows must be in the result.
for (const [name, grades] of [
  ["navycs", navycs],
  ["militarywallet", wallet],
]) {
  for (const [grade, cells] of Object.entries(grades)) {
    for (const yos of Object.keys(cells)) {
      const known = result[grade]?.[yos] !== undefined || repeats.has(`${grade}|${yos}`) || unconfirmed.some((u) => u.startsWith(`${grade} over ${yos}:`));
      if (!known) unconfirmed.push(`${grade} over ${yos}: in ${name} but not in fedpayscale`);
    }
  }
}

const gradeOrder = (g) => ({ E: 0, W: 1, O: 2 })[g[0]] * 100 + Number(g.match(/\d+/)[0]) + (g.endsWith("E") ? 0.5 : 0);
const sorted = Object.fromEntries(Object.entries(result).sort((a, b) => gradeOrder(a[0]) - gradeOrder(b[0])));

console.log(
  `${year}: grades ${Object.keys(sorted).length}, kept ${Object.values(sorted).reduce((n, c) => n + Object.keys(c).length, 0)} of ${cellCount} cells (${repeats.size} repeated steps left out), dissents ${dissents.length}`
);
if (dissents.length) console.log(`  ${dissents.join("\n  ")}`);
if (unconfirmed.length) {
  console.error(`UNCONFIRMED (${unconfirmed.length}): no second copy agrees. Investigate and record in RESOLVED.\n  ${unconfirmed.join("\n  ")}`);
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
      unit: "USD per month",
      authority: "DFAS monthly basic pay table",
      source: `https://fedpayscale.org/military/${year}/`,
      confirmedBy: [`https://www.navycs.com/charts/${year}-military-pay-chart.html`, `https://themilitarywallet.com/${year}-military-pay-charts/`],
      ceiling: {
        rule: "37 U.S.C. 203(a)(2): O-7 to O-10 at Executive Schedule Level II, all other grades at Level V",
        levelIIAnnual: schedule.levelII,
        levelVAnnual: schedule.levelV,
        source: `https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/salary-tables/${String(year).slice(2)}Tables/exec/html/EX.aspx`,
      },
      dissents,
      builtAt: new Date().toISOString().slice(0, 10),
      grades: sorted,
    },
    null,
    1
  )
);
