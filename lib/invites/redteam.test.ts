import { describe, expect, it } from "vitest";
import { captionProblem, opsecWarnings, piiProblem } from "@/lib/invites/opsec";
import { InviteDataSchema, type InviteData } from "@/lib/invites/schema";
import { shareText } from "@/lib/invites/share-text";
import { senderOf } from "@/lib/invites/submit";
import { buildIcs, googleCalendarUrl } from "@/lib/invites/time";

// Fixes from the red team walk of 2026-11-20.

function sample(): InviteData {
  return InviteDataSchema.parse({
    retiree: { rank: "Chief Warrant Officer", name: "Jordan Reyes", branch: "USMC" },
    timeZone: "America/New_York",
    contactEmail: "jordan@example.com",
    rsvp: { deadline: "2026-10-20" },
    base: { passDeadline: "2026-10-15" },
    events: [
      { id: "cer00001", name: "Retirement Ceremony", date: "2026-11-06", start: "10:00", place: "Battalion ramp", address: "Camp Lejeune, NC 28542", onBase: true },
      {
        id: "pty00002",
        name: "Retirement Party",
        date: "2026-11-06",
        start: "17:00",
        place: "The Reyes home",
        address: "123 Ocean Drive, North Topsail Beach, NC 28460",
        area: "North Topsail Beach, NC",
        addressPrivate: true,
      },
    ],
  });
}

describe("the public-page checks read every section", () => {
  const cases: [string, (data: InviteData, text: string) => void][] = [
    ["the biographies", (d, t) => (d.program.bios = [{ id: "bio00001", name: "Jordan Reyes", role: "", short: t, full: "" }])],
    ["the program", (d, t) => (d.program.items = [{ id: "itm00001", kind: "item", title: "Remarks", who: t, cue: "" }])],
    ["the platform party", (d, t) => (d.program.people = [{ id: "ppl00001", role: "Narrator", name: "Sgt Lee", line: t }])],
    ["the visit information", (d, t) => (d.info = [{ id: "inf00001", title: "Lodging", body: t, linkLabel: "", linkUrl: "" }])],
    ["the day at a glance", (d, t) => (d.schedule = [{ id: "sch00001", date: "2026-11-06", time: "", title: "Photos", note: t }])],
    ["the thank-you line", (d, t) => (d.view.thankYou = t)],
  ];

  for (const [where, put] of cases) {
    it(`stops a Social Security number in ${where}, and says where`, () => {
      const data = sample();
      put(data, "SSN 123-45-6789");
      expect(piiProblem(data)).toBe(`Remove the Social Security number from ${where}. This page is public to anyone with the link.`);
    });

    it(`warns about clearance talk in ${where}`, () => {
      const data = sample();
      put(data, "Holds a TS/SCI clearance");
      expect(opsecWarnings(data)).toContain(`A security clearance is mentioned in ${where}. Leave clearance details off a public page.`);
    });
  }

  it("names every place clearance talk appears", () => {
    const data = sample();
    data.welcome = "Retiring with a TS/SCI";
    data.program.bios = [{ id: "bio00001", name: "Jordan Reyes", role: "", short: "Polygraph examiner", full: "" }];
    expect(opsecWarnings(data)[0]).toBe("A security clearance is mentioned in the welcome line and the biographies. Leave clearance details off a public page.");
  });

  it("stops an ID number in a photo caption", () => {
    expect(captionProblem("Boot camp, SSN 123-45-6789")).toMatch(/Social Security number from the caption/);
    expect(captionProblem("Parris Island, 2004")).toBeNull();
  });
});

describe("the ready-to-send invitation", () => {
  it("asks for an RSVP by the date and warns pass guests early", () => {
    const { email, sms } = shareText(sample(), "https://www.milvector.org/r/x");
    expect(email).toContain("Please RSVP on the page by Tuesday, 20 October 2026.");
    expect(email).toContain("The Retirement Ceremony is aboard a military installation.");
    expect(email).toContain("please answer by Thursday, 15 October 2026 to leave time to arrange it.");
    expect(sms).toContain("Please RSVP by 20 October 2026.");
  });

  it("does not ask guests to forward the link when a private home is behind the RSVP", () => {
    expect(shareText(sample(), "u").email).not.toMatch(/pass the link along/);
    const open = sample();
    open.events[1].addressPrivate = false;
    expect(shareText(open, "u").email).toMatch(/pass the link along/);
  });

  it("leaves the RSVP lines out when RSVPs are off", () => {
    const data = sample();
    data.rsvp.enabled = false;
    expect(shareText(data, "u").email).not.toMatch(/RSVP|visitor pass/);
  });
});

describe("calendar entries for a guest who answered", () => {
  const data = sample();
  const party = data.events[1];
  const address = "123 Ocean Drive, North Topsail Beach, NC 28460";

  it("carry the private address only when it is passed in", () => {
    const plain = buildIcs({ data, event: party, slug: "x", pageUrl: "u", now: new Date(0) });
    expect(plain).not.toContain("Ocean Drive");
    expect(plain).toContain("LOCATION:The Reyes home\\, North Topsail Beach\\, NC");
    const own = buildIcs({ data, event: party, slug: "x", pageUrl: "u", now: new Date(0), privateAddress: address });
    expect(own.replace(/\r\n /g, "")).toContain("LOCATION:The Reyes home\\, 123 Ocean Drive\\, North Topsail Beach\\, NC 28460");
    expect(own.replace(/\r\n /g, "")).toContain("Please do not share the address publicly");
  });

  it("puts it in the Google Calendar link the same way", () => {
    expect(googleCalendarUrl({ data, event: party, pageUrl: "u" })).not.toContain("Ocean");
    expect(decodeURIComponent(googleCalendarUrl({ data, event: party, pageUrl: "u", privateAddress: address }).replace(/\+/g, " "))).toContain("123 Ocean Drive");
  });

  it("never put a private address on a public event", () => {
    const ceremony = data.events[0];
    expect(buildIcs({ data, event: ceremony, slug: "x", pageUrl: "u", privateAddress: "1 Secret Ln" })).not.toContain("Secret");
  });
});

describe("the sender count", () => {
  const req = (ip: string) => new Request("https://www.milvector.org/r/x/rsvp", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
  const day = new Date("2026-11-20T12:00:00Z");

  it("is a keyed scramble, never the address", () => {
    const sender = senderOf(req("203.0.113.9"), "reyes-retirement-feee", "secret", day);
    expect(sender).toMatch(/^[a-f0-9]{64}$/);
    expect(sender).not.toContain("203");
    expect(senderOf(req("203.0.113.9"), "REYES-retirement-feee", "secret", day)).toBe(sender);
  });

  it("differs by address, invitation, day, and key", () => {
    const base = senderOf(req("203.0.113.9"), "a-b-c", "secret", day);
    expect(senderOf(req("203.0.113.10"), "a-b-c", "secret", day)).not.toBe(base);
    expect(senderOf(req("203.0.113.9"), "a-b-d", "secret", day)).not.toBe(base);
    expect(senderOf(req("203.0.113.9"), "a-b-c", "secret", new Date("2026-11-21T12:00:00Z"))).not.toBe(base);
    expect(senderOf(req("203.0.113.9"), "a-b-c", "other", day)).not.toBe(base);
  });
});
