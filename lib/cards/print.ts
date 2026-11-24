import { displayPhone, textOnColor, type CardData } from "@/lib/cards/schema";

// Printable paper business cards (3.5 x 2 inches), built as one standalone
// HTML page so the browser prints it at exact size.
//   sheet: US Letter, 10 cards (2 x 5), 0.5 in top and 0.75 in side margins.
//          Matches Avery 8371 and other 10-per-sheet card stock. Page 1 is the
//          fronts, page 2 the backs; the grid is symmetric, so the backs line
//          up when the sheet is turned over on its long edge.
//   shop:  one card per page at 3.75 x 2.25 in (0.125 in bleed on each side),
//          front then back, for a print shop.

export type PrintLayout = "sheet" | "shop";

type PrintArgs = {
  card: CardData;
  slug: string;
  layout: PrintLayout;
  guides: boolean;
  qrSvg: string;
  photoSrc: string | null;
  bannerSrc: string | null;
  // The card address without https://, printed under the QR code.
  shortUrl: string;
};

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** The contact lines on the front: phone, email, then a website or LinkedIn address. */
export function printContactLines(card: CardData): { label: string; value: string }[] {
  const linkedin = card.links.find((link) => link.type === "linkedin")?.url;
  const web = card.website || linkedin || "";
  return [
    card.phone && { label: "Phone", value: displayPhone(card.phone) },
    card.email && { label: "Email", value: card.email },
    web && { label: "Web", value: bare(web) },
  ].filter(Boolean) as { label: string; value: string }[];
}

function front({ card, photoSrc, bannerSrc }: PrintArgs): string {
  const roles = [card.title, card.company].filter(Boolean).map((line) => `<div>${esc(line)}</div>`).join("");
  const photo = photoSrc
    ? `<img class="photo" src="${esc(photoSrc)}" alt="">`
    : `<div class="photo initials">${esc(initials(card.name) || "?")}</div>`;
  const lines = printContactLines(card)
    .map((line) => `<div><span class="k">${line.label}</span>${esc(line.value)}</div>`)
    .join("");
  return `<div class="card front">
  <div class="banner">${bannerSrc ? `<img src="${esc(bannerSrc)}" alt="">` : ""}</div>
  ${photo}
  <div class="ident"><div class="name">${esc(card.name)}</div>${roles ? `<div class="role">${roles}</div>` : ""}</div>
  ${lines ? `<div class="contact">${lines}</div>` : ""}
</div>`;
}

function back({ card, qrSvg, shortUrl }: PrintArgs): string {
  return `<div class="card back">
  <div class="qr">${qrSvg}</div>
  <div class="back-text">
    <div class="cta">Scan to save my contact</div>
    <div class="bname">${esc(card.name)}</div>
    <div class="burl">${esc(shortUrl)}</div>
  </div>
  <div class="bar"></div>
</div>`;
}

export function renderPrintPage(args: PrintArgs): string {
  const { card, layout, guides } = args;
  const sheet = layout === "sheet";
  const accent = card.accent;
  const onAccent = textOnColor(accent);
  const pages = sheet
    ? [Array(10).fill(front(args)).join(""), Array(10).fill(back(args)).join("")].map((cards) => `<section class="page sheet">${cards}</section>`)
    : [front(args), back(args)].map((one) => `<section class="page shop">${one}</section>`);
  const here = (query: string) => `?${query}`;
  const instructions = sheet
    ? "Load 10-per-sheet business card stock (Avery 8371 or any 3.5 x 2 inch, 2 x 5 layout). In the print dialog choose Actual size or Scale 100% and Margins None. Print page 1, put the sheet back in the tray face down, and print page 2 on the back. Test on plain paper first: hold it up to a light against a card sheet."
    : "In the print dialog choose Save as PDF, Margins None, and turn on Background graphics. Upload the PDF to a print shop as a standard 3.5 x 2 inch business card with 0.125 inch bleed. Page 1 is the front, page 2 the back.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Printed cards: ${esc(card.name)}</title>
<style>
@page { size: ${sheet ? "8.5in 11in" : "3.75in 2.25in"}; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e5e7eb; }
body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.toolbar { max-width: 8.5in; margin: 16px auto 0; padding: 14px 16px; background: #fff; border-radius: 10px; font-size: 14px; line-height: 1.45; }
.toolbar h1 { font-size: 17px; margin: 0 0 8px; }
.toolbar nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.toolbar a, .toolbar button { display: inline-block; padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
.toolbar a[aria-current="page"], .toolbar button { background: #1f6f54; border-color: #1f6f54; color: #fff; }
.toolbar p { margin: 6px 0 0; color: #475569; }
.page { background: #fff; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.15); overflow: hidden; position: relative; break-after: page; }
.page:last-of-type { break-after: auto; }
.sheet { width: 8.5in; height: 11in; padding: 0.5in 0.75in; display: grid; grid-template-columns: repeat(2, 3.5in); grid-template-rows: repeat(5, 2in); }
.shop { width: 3.75in; height: 2.25in; padding: 0.125in; }
.card { width: 3.5in; height: 2in; position: relative; --bleed: 0in; }
.shop .card { --bleed: 0.125in; }
${guides ? ".sheet .card { outline: 0.5pt dashed #9ca3af; outline-offset: -0.25pt; }" : ""}
.banner { position: absolute; top: calc(-1 * var(--bleed)); left: calc(-1 * var(--bleed)); right: calc(-1 * var(--bleed)); height: calc(0.875in + var(--bleed)); overflow: hidden; background: linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 70%, #000)); }
.banner img { display: block; width: 100%; height: 100%; object-fit: cover; }
.photo { position: absolute; left: 0.2in; top: 0.52in; width: 0.72in; height: 0.72in; border-radius: 50%; border: 0.035in solid #fff; object-fit: cover; background: #f4f6f9; }
.initials { display: flex; align-items: center; justify-content: center; background: ${accent}; color: ${onAccent}; font-size: 0.26in; font-weight: 700; }
.ident { position: absolute; left: 1.04in; right: 0.16in; top: 0.93in; }
.name { font-size: 11pt; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.role { margin-top: 0.03in; font-size: 7pt; line-height: 1.2; color: #475569; }
.role div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.contact { position: absolute; left: 0.2in; right: 0.16in; bottom: 0.14in; font-size: 6.8pt; line-height: 1.38; }
.contact div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k { display: inline-block; width: 0.36in; color: ${accent}; font-weight: 700; font-size: 5.6pt; text-transform: uppercase; letter-spacing: 0.04em; }
.qr { position: absolute; left: 0.22in; top: 0.3in; width: 1.4in; height: 1.4in; }
.qr svg { display: block; width: 100%; height: 100%; }
.back-text { position: absolute; left: 1.82in; right: 0.2in; top: 0.44in; }
.cta { font-size: 9pt; font-weight: 700; line-height: 1.2; }
.bname { margin-top: 0.08in; font-size: 8pt; line-height: 1.2; }
.burl { margin-top: 0.05in; font-size: 6.5pt; line-height: 1.3; color: #475569; word-break: break-all; }
.bar { position: absolute; left: calc(-1 * var(--bleed)); right: calc(-1 * var(--bleed)); bottom: calc(-1 * var(--bleed)); height: calc(0.12in + var(--bleed)); background: ${accent}; }
@media print {
  html, body { background: #fff; }
  .toolbar { display: none; }
  .page { margin: 0; box-shadow: none; }
}
</style>
</head>
<body>
<div class="toolbar">
  <h1>Printed cards</h1>
  <nav aria-label="Layout">
    <a href="${here(`layout=sheet${guides ? "&guides=1" : ""}`)}"${sheet ? ' aria-current="page"' : ""}>Card sheets, 10 per page</a>
    <a href="${here("layout=shop")}"${sheet ? "" : ' aria-current="page"'}>Print shop file</a>
    ${sheet ? `<a href="${here(`layout=sheet${guides ? "" : "&guides=1"}`)}">${guides ? "Hide cut lines" : "Show cut lines for plain paper"}</a>` : ""}
    <button type="button" id="print">Print</button>
  </nav>
  <p>${instructions}</p>
  <p>The QR code opens your card as it is now, so these never go out of date when you edit it.</p>
</div>
${pages.join("\n")}
<script>document.getElementById("print").addEventListener("click", function () { window.print(); });</script>
</body>
</html>`;
}
