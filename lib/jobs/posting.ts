// Reading a job posting from its link, so a member on a phone can paste one
// link instead of copying a whole description. This file is pure (no network):
// checking the link, and pulling the posting out of what the site returns.
// The network side, with its guards, is lib/jobs/fetch-posting.ts.
//
// Where the posting comes from, in order:
//   1. Workday career sites: their own JSON (the page itself is a script shell).
//   2. schema.org JobPosting data in the page, which most job sites publish for
//      search engines: title, company, location, and the full description.
//   3. The page's main text, with menus, headers, and footers removed.
import net from "node:net";
import { jsonrepair } from "jsonrepair";

export type Posting = { title: string | null; company: string | null; location: string | null; text: string };

// Shorter than this, the page did not give us the posting.
export const POSTING_MIN_CHARS = 300;

export const LINK_MESSAGES = {
  invalid: "That does not look like a link. Copy the posting's web address and paste it here.",
  linkedin:
    "LinkedIn does not let tools read its postings. On the LinkedIn job, tap Apply to open the company's own posting and copy that link, or paste the description.",
  blockedAddress: "That link cannot be read. Use the posting's public web address.",
  refused: "That site does not let tools read its postings. Paste the description instead.",
  notFound: "That page was not found. The posting may have closed. Check the link.",
  failed: "That site did not send the posting. Try again, or paste the description.",
  thin: "We opened the page but could not find the posting on it. Some job sites load postings in a way tools cannot read. Paste the description instead.",
  timeout: "That site took too long to answer. Try again, or paste the description.",
  unreachable: "We could not reach that site. Check the link.",
} as const;

// ─── The link ─────────────────────────────────────────────────────────

function isLinkedIn(host: string) {
  return host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in";
}

/** True for an address on the public internet: not this machine, a private network, or link-local. */
export function isPublicAddress(ip: string): boolean {
  const address = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // shared address space
    if (a === 169 && b === 254) return false; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false; // multicast and reserved
    return true;
  }
  if (net.isIPv6(address)) {
    if (address === "::" || address === "::1") return false;
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (address.startsWith("::ffff:") || address.startsWith("64:ff9b:")) return false;
    if (/^fe[89ab]/.test(address)) return false; // link-local
    if (/^f[cd]/.test(address)) return false; // unique local
    if (address.startsWith("ff")) return false; // multicast
    return true;
  }
  return false;
}

export type LinkCheck = { ok: true; url: URL } | { ok: false; message: string };

/**
 * Finds the link in what was pasted (a phone's share sheet often adds the job
 * title before it) and checks it is one we may open.
 */
export function checkPostingLink(input: string): LinkCheck {
  const text = input.trim();
  const found = text.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(text) ? `https://${text}` : null);
  if (!found) return { ok: false, message: LINK_MESSAGES.invalid };
  let url: URL;
  try {
    url = new URL(found.replace(/[).,;]+$/, ""));
  } catch {
    return { ok: false, message: LINK_MESSAGES.invalid };
  }
  return checkUrl(url);
}

/** The same checks for a URL already parsed, such as a redirect target. */
export function checkUrl(url: URL): LinkCheck {
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: LINK_MESSAGES.invalid };
  if (url.username || url.password) return { ok: false, message: LINK_MESSAGES.blockedAddress };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, message: LINK_MESSAGES.blockedAddress };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isLinkedIn(host)) return { ok: false, message: LINK_MESSAGES.linkedin };
  if (host === "localhost" || /\.(localhost|local|internal|home|lan)$/.test(host)) return { ok: false, message: LINK_MESSAGES.blockedAddress };
  const bare = host.replace(/^\[|\]$/g, "");
  if (net.isIP(bare) && !isPublicAddress(bare)) return { ok: false, message: LINK_MESSAGES.blockedAddress };
  if (!net.isIP(bare) && !host.includes(".")) return { ok: false, message: LINK_MESSAGES.invalid };
  return { ok: true, url };
}

// ─── HTML to text ─────────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
  bull: String.fromCharCode(0x2022),
  middot: String.fromCharCode(0xb7),
  ndash: String.fromCharCode(0x2013),
  mdash: String.fromCharCode(0x2014),
  trade: String.fromCharCode(0x2122),
  reg: String.fromCharCode(0xae),
  copy: String.fromCharCode(0xa9),
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

const ALWAYS_DROP = ["script", "style", "noscript", "template", "svg", "iframe", "head", "select", "button", "dialog"];
const CHROME = ["nav", "header", "footer", "aside", "form"];

/** Readable text from HTML: block elements become line breaks, list items become bullets. */
export function htmlToText(html: string, options: { dropChrome?: boolean } = {}): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of options.dropChrome ? [...ALWAYS_DROP, ...CHROME] : ALWAYS_DROP) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
  }
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, `\n${String.fromCharCode(0x2022)} `)
    .replace(/<\/?(p|div|section|article|main|h[1-6]|ul|ol|li|tr|table|blockquote|dd|dt|dl)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v\u00a0\u200b]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── schema.org JobPosting ────────────────────────────────────────────

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/^\s*(\/\*\s*)?<!\[CDATA\[(\s*\*\/)?/, "").replace(/(\/\*\s*)?\]\]>(\s*\*\/)?\s*$/, "").trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(jsonrepair(cleaned));
    } catch {
      return null;
    }
  }
}

type Json = Record<string, unknown>;

function isJobPosting(value: unknown): value is Json {
  if (!value || typeof value !== "object") return false;
  const type = (value as Json)["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

function findJobPosting(value: unknown, depth = 0): Json | null {
  if (depth > 6 || !value || typeof value !== "object") return null;
  if (isJobPosting(value)) return value;
  const children = Array.isArray(value) ? value : Object.values(value as Json);
  for (const child of children) {
    const hit = findJobPosting(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function nameOf(value: unknown): string | null {
  if (typeof value === "string") return str(value);
  if (value && typeof value === "object") return str((value as Json).name);
  return null;
}

function locationOf(job: Json): string | null {
  if (job.jobLocationType === "TELECOMMUTE") return "Remote";
  const places = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  const names = places
    .map((place) => {
      const address = place && typeof place === "object" ? (place as Json).address : null;
      if (typeof address === "string") return str(address);
      if (address && typeof address === "object") {
        const a = address as Json;
        return [str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(", ") || str(a.addressCountry);
      }
      return null;
    })
    .filter((name): name is string => !!name);
  return names.length ? [...new Set(names)].slice(0, 3).join("; ") : null;
}

/** Text from a description that may be HTML, or HTML with its tags escaped. */
function richText(value: unknown): string {
  if (typeof value !== "string") return "";
  const html = /&lt;\/?[a-z]/i.test(value) ? decodeEntities(value) : value;
  return htmlToText(html);
}

function sectionText(value: unknown): string {
  if (Array.isArray(value)) return value.map(sectionText).filter(Boolean).join("\n");
  if (value && typeof value === "object") return richText((value as Json).description ?? (value as Json).name);
  return richText(value);
}

function compose(title: string | null, company: string | null, location: string | null, body: string): string {
  const head = [title, company, location ? `Location: ${location}` : null].filter(Boolean).join("\n");
  return [head, body].filter(Boolean).join("\n\n").trim();
}

export function postingFromJsonLd(html: string): Posting | null {
  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  for (const block of blocks) {
    const job = findJobPosting(parseJson(block[1]));
    if (!job) continue;
    const title = str(typeof job.title === "string" ? decodeEntities(job.title) : null);
    const company = nameOf(job.hiringOrganization);
    const location = locationOf(job);
    const description = richText(job.description);
    const extras = (
      [
        ["Responsibilities", job.responsibilities],
        ["Qualifications", job.qualifications],
        ["Skills", job.skills],
        ["Education", job.educationRequirements],
        ["Experience", job.experienceRequirements],
      ] as const
    )
      .map(([label, value]) => [label, sectionText(value)] as const)
      .filter(([, text]) => text && !description.includes(text.slice(0, 80)))
      .map(([label, text]) => `${label}:\n${text}`);
    const body = [description, ...extras].filter(Boolean).join("\n\n");
    if (!body) continue;
    return { title, company, location, text: compose(title, company, location, body) };
  }
  return null;
}

// ─── Workday ──────────────────────────────────────────────────────────

/**
 * Workday career pages are a script shell; the site itself loads the posting
 * from a JSON address built from the page address. Returns that address.
 *   https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/Analyst_R123
 *   https://wd1.myworkdaysite.com/recruiting/acme/Careers/job/Austin-TX/Analyst_R123
 */
export function workdayJsonUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  const job = parts.indexOf("job");
  if (job < 1 || job === parts.length - 1) return null;
  const rest = parts.slice(job + 1).join("/");
  const site = parts[job - 1];
  const hosted = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (hosted) return `https://${host}/wday/cxs/${hosted[1]}/${site}/job/${rest}`;
  if (/^wd\d+\.myworkdaysite\.com$/.test(host) && parts[0] === "recruiting" && job === 3) return `https://${host}/wday/cxs/${parts[1]}/${site}/job/${rest}`;
  return null;
}

export function postingFromWorkday(json: unknown): Posting | null {
  if (!json || typeof json !== "object") return null;
  const info = (json as Json).jobPostingInfo as Json | undefined;
  if (!info || typeof info.jobDescription !== "string") return null;
  const title = str(info.title);
  const company = nameOf((json as Json).hiringOrganization);
  const location = str(info.location);
  return { title, company, location, text: compose(title, company, location, htmlToText(info.jobDescription)) };
}

// ─── The page itself ──────────────────────────────────────────────────

function metaContent(html: string, property: string): string | null {
  const tag = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`, "i"))?.[0];
  const content = tag?.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
  return content ? str(decodeEntities(content[2] ?? content[3] ?? "")) : null;
}

function inner(html: string, tag: string): string | null {
  return html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}\\s*>`, "i"))?.[1] ?? null;
}

export function postingFromPage(html: string): Posting {
  // Page titles often end with the site: "Program Manager | Acme Careers".
  const rawTitle = metaContent(html, "og:title") ?? str(decodeEntities(inner(html, "title") ?? "").replace(/\s+/g, " "));
  const title = rawTitle ? str(rawTitle.split(" | ")[0]) : null;
  // The site's name is not the employer on a job board (USAJOBS, for one),
  // so without structured data the member fills in the company.
  const company = null;
  // Prefer the page's main region; fall back to the article, then the body.
  let text = "";
  for (const region of [inner(html, "main"), inner(html, "article"), inner(html, "body"), html]) {
    if (!region) continue;
    text = htmlToText(region, { dropChrome: true });
    if (text.length >= POSTING_MIN_CHARS) break;
  }
  return { title, company, location: null, text };
}

/** The best posting a page offers: its JobPosting data, or else its main text. */
export function postingFromHtml(html: string): Posting {
  const structured = postingFromJsonLd(html);
  if (structured && structured.text.length >= POSTING_MIN_CHARS) return structured;
  const page = postingFromPage(html);
  return { ...page, title: structured?.title ?? page.title, company: structured?.company ?? page.company, location: structured?.location ?? null };
}
