// Fetches a job posting from a member's link, on the server. The link comes
// from a member, so every request is guarded:
//   - public http(s) addresses only, on the standard ports, no LinkedIn
//   - every host name is checked at connection time, after DNS, on every
//     redirect, so a name that points at a private or cloud-metadata address
//     is refused (no fetching inside our own network)
//   - at most 5 redirects, 3 MB, and 12 seconds
// The bot says who it is; a site that refuses tools gets a plain message back.
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { extractTextFromPdfBuffer } from "@/lib/pdf";
import { POSTING_LIMIT } from "@/lib/resume/limits";
import { checkPostingLink, checkUrl, isPublicAddress, LINK_MESSAGES, POSTING_MIN_CHARS, postingFromHtml, postingFromWorkday, workdayJsonUrl, type Posting } from "@/lib/jobs/posting";

const USER_AGENT = "Mozilla/5.0 (compatible; MilVectorBot/1.0; +https://www.milvector.org)";
const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12_000;

export type PostingResult = { ok: true; posting: Posting; url: string } | { ok: false; message: string };

class BlockedAddress extends Error {
  code = "EBLOCKED";
}

type LookupResult = string | dns.LookupAddress[];

// Resolves like the default lookup, then refuses any private address.
export const guardedLookup = ((hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: LookupResult, family?: number) => void) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, options.all ? [] : "", 4);
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) return callback(new BlockedAddress("blocked"), options.all ? [] : "", 4);
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as LookupFunction;

type Response = { status: number; location?: string; contentType: string; body: Buffer };

function getOnce(url: URL, accept: string, signal: AbortSignal): Promise<Response> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    const req = client.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "en-US,en;q=0.8" },
        lookup: guardedLookup,
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return finish(() => resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0) }));
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream: NodeJS.ReadableStream =
          encoding === "gzip" || encoding === "x-gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          // Enough for any posting: keep what arrived and stop reading.
          if (size > MAX_BYTES) {
            finish(() => resolve({ status, contentType, body: Buffer.concat(chunks) }));
            req.destroy();
          }
        });
        stream.on("end", () => finish(() => resolve({ status, contentType, body: Buffer.concat(chunks) })));
        stream.on("error", (error) => finish(() => reject(error)));
      },
    );
    req.on("error", (error) => finish(() => reject(error)));
    req.end();
  });
}

async function getFollowing(start: URL, accept: string, signal: AbortSignal): Promise<Response & { url: URL }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await getOnce(url, accept, signal);
    if (!res.location) return { ...res, url };
    let next: URL;
    try {
      next = new URL(res.location, url);
    } catch {
      throw new Error("bad redirect");
    }
    const checked = checkUrl(next);
    if (!checked.ok) throw Object.assign(new Error(checked.message), { memberMessage: checked.message });
    url = checked.url;
  }
  throw new Error("too many redirects");
}

function decode(body: Buffer, contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function statusMessage(status: number) {
  if (status === 401 || status === 403 || status === 429 || status === 999) return LINK_MESSAGES.refused;
  if (status === 404 || status === 410) return LINK_MESSAGES.notFound;
  return LINK_MESSAGES.failed;
}

function done(posting: Posting, url: URL): PostingResult {
  if (posting.text.length < POSTING_MIN_CHARS) return { ok: false, message: LINK_MESSAGES.thin };
  return { ok: true, posting: { ...posting, text: posting.text.slice(0, POSTING_LIMIT) }, url: url.href };
}

export async function readJobPosting(link: string): Promise<PostingResult> {
  const checked = checkPostingLink(link);
  if (!checked.ok) return checked;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const workday = workdayJsonUrl(checked.url);
    if (workday) {
      const res = await getFollowing(new URL(workday), "application/json", controller.signal).catch(() => null);
      if (res && res.status === 200) {
        let json: unknown = null;
        try {
          json = JSON.parse(decode(res.body, res.contentType));
        } catch {
          json = null;
        }
        const posting = postingFromWorkday(json);
        if (posting && posting.text.length >= POSTING_MIN_CHARS) return done(posting, checked.url);
      }
    }

    const res = await getFollowing(checked.url, "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5", controller.signal);
    if (res.status < 200 || res.status >= 300) return { ok: false, message: statusMessage(res.status) };

    if (res.contentType.includes("application/pdf") || res.body.subarray(0, 5).toString("latin1") === "%PDF-") {
      const text = await extractTextFromPdfBuffer(res.body);
      return done({ title: null, company: null, location: null, text }, res.url);
    }
    const body = decode(res.body, res.contentType);
    if (res.contentType.startsWith("text/plain")) return done({ title: null, company: null, location: null, text: body.trim() }, res.url);
    return done(postingFromHtml(body), res.url);
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { memberMessage?: string };
    if (err.memberMessage) return { ok: false, message: err.memberMessage };
    if (err instanceof BlockedAddress || err.code === "EBLOCKED") return { ok: false, message: LINK_MESSAGES.blockedAddress };
    if (controller.signal.aborted || err.name === "AbortError") return { ok: false, message: LINK_MESSAGES.timeout };
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") return { ok: false, message: LINK_MESSAGES.unreachable };
    return { ok: false, message: LINK_MESSAGES.failed };
  } finally {
    clearTimeout(timer);
  }
}
