import { describe, expect, it } from "vitest";
import { guardedLookup, readJobPosting } from "@/lib/jobs/fetch-posting";
import { checkPostingLink, isPublicAddress, LINK_MESSAGES, postingFromHtml, postingFromJsonLd, postingFromPage, postingFromWorkday, workdayJsonUrl } from "@/lib/jobs/posting";
import { AI_MESSAGES, memberMessageFor } from "@/lib/llm/client";

const BULLET = String.fromCharCode(0x2022);
const longDuties = Array.from({ length: 12 }, (_, i) => `<li>Lead logistics planning task number ${i + 1} across the program office</li>`).join("");

describe("checkPostingLink", () => {
  it("finds the link inside what a phone's share sheet pastes", () => {
    const r = checkPostingLink("Logistics Analyst at Acme Corp https://careers.acme.com/jobs/123?src=share");
    expect(r.ok && r.url.href).toBe("https://careers.acme.com/jobs/123?src=share");
  });

  it("accepts an address without https://", () => {
    const r = checkPostingLink("careers.acme.com/jobs/123");
    expect(r.ok && r.url.href).toBe("https://careers.acme.com/jobs/123");
  });

  it("turns LinkedIn away with directions to the company's own posting", () => {
    for (const link of ["https://www.linkedin.com/jobs/view/4012345678", "https://linkedin.com/jobs/view/1", "https://lnkd.in/abc"]) {
      expect(checkPostingLink(link)).toEqual({ ok: false, message: LINK_MESSAGES.linkedin });
    }
  });

  it("refuses this machine, private networks, cloud metadata, and odd ports", () => {
    for (const link of [
      "http://localhost:3000/admin",
      "http://127.0.0.1/",
      "http://0x7f000001/",
      "http://2130706433/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/jobs",
      "http://192.168.1.1/",
      "http://[::1]/",
      "http://jobs.internal/x",
      "https://careers.acme.com:8443/jobs/1",
      "https://user:pass@careers.acme.com/jobs/1",
    ]) {
      expect(checkPostingLink(link).ok, link).toBe(false);
    }
  });

  it("says plainly when there is no link", () => {
    expect(checkPostingLink("I saw a job at the base")).toEqual({ ok: false, message: LINK_MESSAGES.invalid });
    expect(checkPostingLink("ftp://files.acme.com/job.pdf").ok).toBe(false);
  });
});

describe("isPublicAddress", () => {
  it("knows public from private, IPv4 and IPv6", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "100.64.0.1", "169.254.169.254", "127.0.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "224.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});

describe("the DNS guard", () => {
  it("refuses a host name that resolves to this machine, at connection time", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      (guardedLookup as unknown as (h: string, o: object, cb: (e: NodeJS.ErrnoException | null) => void) => void)("localhost", {}, (e) => resolve(e)),
    );
    expect(error?.code).toBe("EBLOCKED");
  });

  it("never fetches a refused link", async () => {
    expect(await readJobPosting("http://169.254.169.254/latest/meta-data/")).toEqual({ ok: false, message: LINK_MESSAGES.blockedAddress });
    expect(await readJobPosting("https://www.linkedin.com/jobs/view/1")).toEqual({ ok: false, message: LINK_MESSAGES.linkedin });
  });
});

describe("postingFromJsonLd", () => {
  const ld = (job: object) => `<html><head><script type="application/ld+json">${JSON.stringify(job)}</script></head><body>menu</body></html>`;

  it("reads the title, company, location, and description with its bullets", () => {
    const p = postingFromJsonLd(
      ld({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Logistics Analyst",
        hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
        jobLocation: { "@type": "Place", address: { addressLocality: "Jacksonville", addressRegion: "NC" } },
        description: `<p>Support the program office.</p><ul>${longDuties}</ul>`,
      }),
    )!;
    expect(p.title).toBe("Logistics Analyst");
    expect(p.company).toBe("Acme Corp");
    expect(p.location).toBe("Jacksonville, NC");
    expect(p.text.startsWith("Logistics Analyst\nAcme Corp\nLocation: Jacksonville, NC\n\nSupport the program office.")).toBe(true);
    expect(p.text).toContain(`${BULLET} Lead logistics planning task number 12 across the program office`);
  });

  it("handles a description whose HTML arrives escaped, a @graph, and remote work", () => {
    const p = postingFromJsonLd(
      ld({ "@graph": [{ "@type": "WebPage" }, { "@type": ["JobPosting"], title: "Analyst &amp; Planner", jobLocationType: "TELECOMMUTE", description: "&lt;p&gt;Duties &amp;amp; more&lt;/p&gt;" }] }),
    )!;
    expect(p.title).toBe("Analyst & Planner");
    expect(p.location).toBe("Remote");
    expect(p.text).toContain("Duties & more");
  });

  it("repairs JSON with a raw line break inside a string", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Planner","description":"Line one
line two"}</script>`;
    expect(postingFromJsonLd(html)?.text).toContain("Line one");
  });

  it("returns null when the page has no JobPosting", () => {
    expect(postingFromJsonLd(ld({ "@type": "Organization", name: "Acme" }))).toBeNull();
  });
});

describe("postingFromPage and postingFromHtml", () => {
  const page = `<html><head><title>Ignored</title><meta property="og:title" content="Program Manager | Acme"><meta property="og:site_name" content="Acme Careers"></head>
    <body><header>Sign in Careers Home</header><nav>Jobs Benefits About</nav>
    <main><h1>Program Manager</h1><p>Lead a team of twelve.</p><ul>${longDuties}</ul><form><button>Apply</button></form></main>
    <footer>Privacy Terms Cookies</footer></body></html>`;

  it("keeps the main content and drops menus, headers, footers, and forms", () => {
    const p = postingFromPage(page);
    // The site name is dropped from the title, and is not taken as the employer.
    expect(p.title).toBe("Program Manager");
    expect(p.company).toBeNull();
    expect(p.text.startsWith("Program Manager\n\nLead a team of twelve.")).toBe(true);
    expect(p.text).not.toMatch(/Sign in|Benefits About|Privacy Terms|Apply/);
  });

  it("uses the page text when the JobPosting description is too short, but keeps its title", () => {
    const withThinLd = page.replace("</head>", `<script type="application/ld+json">{"@type":"JobPosting","title":"Program Manager II","description":"See below."}</script></head>`);
    const p = postingFromHtml(withThinLd);
    expect(p.title).toBe("Program Manager II");
    expect(p.text).toContain("Lead a team of twelve.");
  });
});

describe("Workday", () => {
  it("builds the JSON address for both Workday host styles", () => {
    expect(workdayJsonUrl(new URL("https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/Analyst_R123?src=x"))).toBe(
      "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/job/Austin-TX/Analyst_R123",
    );
    expect(workdayJsonUrl(new URL("https://acme.wd1.myworkdayjobs.com/Careers/job/Remote/Analyst_R9"))).toBe("https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/Careers/job/Remote/Analyst_R9");
    expect(workdayJsonUrl(new URL("https://wd1.myworkdaysite.com/recruiting/acme/Careers/job/Austin/Analyst_R1"))).toBe("https://wd1.myworkdaysite.com/wday/cxs/acme/Careers/job/Austin/Analyst_R1");
    expect(workdayJsonUrl(new URL("https://acme.wd5.myworkdayjobs.com/en-US/Careers"))).toBeNull();
    expect(workdayJsonUrl(new URL("https://careers.acme.com/job/123"))).toBeNull();
  });

  it("reads Workday's posting JSON", () => {
    const p = postingFromWorkday({ jobPostingInfo: { title: "Analyst", location: "Austin, TX", jobDescription: `<p>Plan things.</p><ul>${longDuties}</ul>` }, hiringOrganization: { name: "Acme" } })!;
    expect(p.text.startsWith("Analyst\nAcme\nLocation: Austin, TX\n\nPlan things.")).toBe(true);
    expect(postingFromWorkday({ nothing: true })).toBeNull();
  });
});

describe("memberMessageFor", () => {
  const apiError = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });

  it("hides OpenAI's billing wording from members", () => {
    expect(memberMessageFor(apiError(429, "insufficient_quota", "429 You exceeded your current quota, please check your plan and billing details."))).toBe(AI_MESSAGES.paused);
    expect(memberMessageFor(apiError(401, "invalid_api_key", "401 Incorrect API key provided"))).toBe(AI_MESSAGES.paused);
  });

  it("says busy for a rate limit and outage for a server error", () => {
    expect(memberMessageFor(apiError(429, "rate_limit_exceeded", "429 Rate limit reached"))).toBe(AI_MESSAGES.busy);
    expect(memberMessageFor(apiError(503, "", "503 Service Unavailable"))).toBe(AI_MESSAGES.outage);
  });

  it("leaves other errors alone", () => {
    expect(memberMessageFor(apiError(400, "context_length_exceeded", "400 too long"))).toBeNull();
    expect(memberMessageFor(new Error("The model request timed out"))).toBeNull();
  });
});
