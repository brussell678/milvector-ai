import { describe, expect, it } from "vitest";
import { opsecWarnings, piiProblem } from "@/lib/invites/opsec";
import {
  InviteDataSchema,
  inviteSlugProblem,
  mergePrivate,
  readInviteData,
  splitPrivate,
  starterInvite,
  suggestedSlug,
  validCover,
  type InviteData,
} from "@/lib/invites/schema";
import { contrastRatio, inviteColors, TEMPLATES } from "@/lib/invites/templates";
import {
  buildIcs,
  directionsUrl,
  eventWindow,
  formatDateLong,
  formatTime,
  formatTimeRange,
  googleCalendarUrl,
  sortEvents,
  zonedToUtc,
} from "@/lib/invites/time";

function sample(): InviteData {
  return InviteDataSchema.parse({
    retiree: { rank: "Chief Warrant Officer", name: "Jordan Reyes", branch: "USMC" },
    template: "dress-blues",
    timeZone: "America/New_York",
    contactEmail: "jordan@example.com",
    events: [
      {
        id: "cer00001",
        name: "Retirement Ceremony",
        date: "2026-11-06",
        start: "10:00",
        end: "11:30",
        place: "Battalion ramp, Bldg. 1854",
        address: "Camp Lejeune, NC 28542",
        onBase: true,
        dressMilitary: "Utilities",
        dressCivilian: "Whatever the weather permits",
      },
      {
        id: "pty00002",
        name: "Retirement Party",
        date: "2026-11-06",
        start: "15:00",
        end: "19:00",
        place: "The Reyes home",
        address: "123 Ocean Drive, North Topsail Beach, NC 28460",
        area: "North Topsail Beach, NC",
        addressPrivate: true,
        notes: "Food provided; bring your own drinks, chairs welcome",
      },
    ],
  });
}

describe("invitation content", () => {
  it("accepts a full invitation and fills defaults", () => {
    const data = sample();
    expect(data.timeFormat).toBe("24h");
    expect(data.accent).toBe("");
    expect(data.welcome.length).toBeGreaterThan(10);
  });

  it("refuses a fourth event, a missing name, and a bad time", () => {
    const base = sample();
    const extra = (id: string) => ({ ...base.events[0], id });
    expect(InviteDataSchema.safeParse({ ...base, events: [extra("aaaa1"), extra("bbbb2"), extra("cccc3"), extra("dddd4")] }).success).toBe(false);
    expect(InviteDataSchema.safeParse({ ...base, retiree: { ...base.retiree, name: " " } }).success).toBe(false);
    expect(InviteDataSchema.safeParse({ ...base, events: [{ ...base.events[0], start: "25:00" }] }).success).toBe(false);
    expect(InviteDataSchema.safeParse({ ...base, events: [{ ...base.events[0], date: "2026-02-30" }] }).success).toBe(false);
  });

  it("refuses two events with the same id", () => {
    const base = sample();
    expect(InviteDataSchema.safeParse({ ...base, events: [base.events[0], { ...base.events[1], id: base.events[0].id }] }).success).toBe(false);
  });

  it("strips control characters and trims text", () => {
    const base = sample();
    const parsed = InviteDataSchema.parse({ ...base, welcome: "  Hello\u0007 there  " });
    expect(parsed.welcome).toBe("Hello there");
  });

  it("starts a new invitation from profile values", () => {
    const starter = starterInvite({ name: "Jordan Reyes", rank: "MSgt", branch: "Navy", ceremonyDate: "2027-05-01", timeZone: "Asia/Tokyo" });
    expect(starter.retiree).toEqual({ rank: "MSgt", name: "Jordan Reyes", branch: "Navy" });
    expect(starter.events[0].date).toBe("2027-05-01");
    expect(starter.events[0].onBase).toBe(true);
    expect(starter.timeZone).toBe("Asia/Tokyo");
    expect(InviteDataSchema.safeParse(starter).success).toBe(true);
    expect(starterInvite({ branch: "Navy SEALs", timeZone: "Mars/Olympus" })).toMatchObject({ retiree: { branch: "USMC" }, timeZone: "America/New_York" });
  });

  it("reads a damaged row without breaking, dropping only what is broken", () => {
    const good = sample();
    const read = readInviteData({ ...good, template: "neon", events: [good.events[0], { id: "x", name: 4 }] });
    expect(read.template).toBe("dress-blues");
    expect(read.events).toHaveLength(1);
    expect(read.retiree.name).toBe("Jordan Reyes");
    expect(readInviteData(null).events).toEqual([]);
  });
});

describe("private addresses", () => {
  it("moves a private street address out of the public data and back for the owner", () => {
    const data = sample();
    const { publicData, privateData } = splitPrivate(data);
    expect(JSON.stringify(publicData)).not.toContain("Ocean Drive");
    expect(publicData.events[1].area).toBe("North Topsail Beach, NC");
    expect(privateData.addresses.pty00002).toContain("Ocean Drive");
    // Public addresses stay where they are.
    expect(publicData.events[0].address).toBe("Camp Lejeune, NC 28542");
    expect(mergePrivate(publicData, privateData)).toEqual(data);
  });

  it("ignores junk in stored private data", () => {
    const data = splitPrivate(sample()).publicData;
    expect(mergePrivate(data, { addresses: { "../x": "nope", pty00002: 7 } }).events[1].address).toBe("");
  });
});

describe("page address", () => {
  it("suggests an address from the last name with a random tail", () => {
    expect(suggestedSlug("Jordan A. Reyes", "4f2a")).toBe("reyes-retirement-4f2a");
    expect(suggestedSlug("José Núñez", "0b1c")).toBe("nunez-retirement-0b1c");
    expect(suggestedSlug("", "0b1c")).toBe("retirement-0b1c");
  });

  it("rejects malformed and reserved addresses", () => {
    expect(inviteSlugProblem("reyes-retirement")).toBeNull();
    expect(inviteSlugProblem("Reyes")).not.toBeNull();
    expect(inviteSlugProblem("a")).not.toBeNull();
    expect(inviteSlugProblem("reyes--retirement")).not.toBeNull();
    expect(inviteSlugProblem("calendar")).not.toBeNull();
    expect(inviteSlugProblem("usmc")).not.toBeNull();
  });
});

describe("cover photo", () => {
  it("accepts only a JPEG within the size limit", () => {
    expect(validCover("/9j/4AAQSkZJRg==")).toBe(true);
    expect(validCover("iVBORw0KGgo=")).toBe(false);
    expect(validCover("/9j/" + "A".repeat(480_000))).toBe(false);
    expect(validCover("/9j/<script>")).toBe(false);
  });
});

describe("OPSEC checks", () => {
  it("stops a Social Security number anywhere on the page", () => {
    const data = sample();
    data.events[0].notes = "Gate list needs SSN 123-45-6789";
    expect(piiProblem(data)).toMatch(/Social Security/);
    expect(piiProblem(sample())).toBeNull();
  });

  it("warns about a public home address but not a private one or a base", () => {
    const data = sample();
    expect(opsecWarnings(data)).toEqual([]);
    data.events[1].addressPrivate = false;
    expect(opsecWarnings(data).join(" ")).toMatch(/private home/);
  });

  it("warns about a .mil contact address and clearance talk", () => {
    const data = sample();
    data.contactEmail = "jordan.reyes@usmc.mil";
    data.welcome = "Retiring with a TS/SCI";
    const warnings = opsecWarnings(data).join(" ");
    expect(warnings).toMatch(/\.mil/);
    expect(warnings).toMatch(/clearance/);
  });
});

describe("dates and times", () => {
  it("writes dates day-month-year and times either way", () => {
    expect(formatDateLong("2026-11-06")).toBe("Friday, 6 November 2026");
    expect(formatTime("10:00", "24h")).toBe("1000");
    expect(formatTime("00:05", "24h")).toBe("0005");
    expect(formatTime("15:30", "12h")).toBe("3:30 PM");
    expect(formatTime("00:15", "12h")).toBe("12:15 AM");
    expect(formatTime("12:00", "12h")).toBe("12:00 PM");
    expect(formatTimeRange({ start: "10:00", end: "11:30" }, "24h")).toBe("1000 until 1130");
    expect(formatTimeRange({ start: "10:00", end: "" }, "12h")).toBe("10:00 AM");
  });

  it("converts venue time to UTC across daylight saving", () => {
    // Eastern Standard Time after the November change
    expect(zonedToUtc("2026-11-06", "10:00", "America/New_York").toISOString()).toBe("2026-11-06T15:00:00.000Z");
    // Eastern Daylight Time in summer
    expect(zonedToUtc("2026-07-04", "10:00", "America/New_York").toISOString()).toBe("2026-07-04T14:00:00.000Z");
    // The morning the clocks fall back
    expect(zonedToUtc("2026-11-01", "09:00", "America/New_York").toISOString()).toBe("2026-11-01T14:00:00.000Z");
    // No daylight saving in Okinawa or Arizona
    expect(zonedToUtc("2026-11-06", "10:00", "Asia/Tokyo").toISOString()).toBe("2026-11-06T01:00:00.000Z");
    expect(zonedToUtc("2026-07-04", "10:00", "America/Phoenix").toISOString()).toBe("2026-07-04T17:00:00.000Z");
  });

  it("gives an hour when there is no end and runs past midnight when the end is earlier", () => {
    const data = sample();
    const open = eventWindow({ ...data.events[0], end: "" }, data.timeZone);
    expect(open.end.getTime() - open.start.getTime()).toBe(60 * 60 * 1000);
    const late = eventWindow({ ...data.events[1], start: "20:00", end: "01:00" }, data.timeZone);
    expect(late.end.toISOString()).toBe("2026-11-07T06:00:00.000Z");
  });

  it("orders events by when they happen", () => {
    const ordered = sortEvents([
      { date: "2026-11-06", start: "15:00", name: "b" },
      { date: "2026-11-05", start: "18:00", name: "a" },
      { date: "2026-11-06", start: "10:00", name: "c" },
    ]);
    expect(ordered.map((e) => e.name)).toEqual(["a", "c", "b"]);
  });
});

describe("calendar files", () => {
  const data = sample();
  const ics = buildIcs({ data, event: data.events[0], slug: "reyes-retirement-4f2a", pageUrl: "https://www.milvector.org/r/reyes-retirement-4f2a", now: new Date("2026-08-29T00:00:00Z") });

  it("carries the right instant, escaped text, and CRLF line endings", () => {
    expect(ics).toContain("DTSTART:20261106T150000Z");
    expect(ics).toContain("DTEND:20261106T163000Z");
    expect(ics).toContain("SUMMARY:Chief Warrant Officer Jordan Reyes: Retirement Ceremony");
    expect(ics).toContain("LOCATION:Battalion ramp\\, Bldg. 1854\\, Camp Lejeune\\, NC 28542");
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("folds long lines to 75 bytes", () => {
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("never carries a private address", () => {
    const party = buildIcs({ data, event: data.events[1], slug: "x-retirement", pageUrl: "https://www.milvector.org/r/x-retirement" });
    const unfolded = party.replace(/\r\n /g, "");
    expect(unfolded).not.toContain("Ocean Drive");
    expect(unfolded).toContain("LOCATION:The Reyes home\\, North Topsail Beach\\, NC");
    expect(unfolded).toContain("shared with guests who RSVP");
  });

  it("builds a Google Calendar link without the private address", () => {
    const url = googleCalendarUrl({ data, event: data.events[1], pageUrl: "https://www.milvector.org/r/x" });
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(decodeURIComponent(url)).not.toContain("Ocean Drive");
    expect(new URL(url).searchParams.get("dates")).toBe("20261106T200000Z/20261107T000000Z");
  });

  it("offers directions only for a public address", () => {
    expect(directionsUrl(data.events[0])).toContain("google.com/maps");
    expect(directionsUrl(data.events[1])).toBeNull();
  });
});

describe("template colors", () => {
  it("keeps accent text readable on every template", () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const accent of ["", "#f2b705", "#1d3557", "#ffffff", "#000000"]) {
        const colors = inviteColors(template, accent);
        expect(contrastRatio(colors.accentText, colors.bg), `${template.id} ${accent}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.ink, colors.bg), template.id).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(colors.muted, colors.bg), template.id).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.onAccent, colors.accent), `${template.id} ${accent} button`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.qr, "#ffffff"), `${template.id} ${accent} qr`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("falls back to the template accent for a bad color", () => {
    expect(inviteColors(TEMPLATES.formal, "red").accent).toBe(TEMPLATES.formal.defaultAccent);
  });
});
