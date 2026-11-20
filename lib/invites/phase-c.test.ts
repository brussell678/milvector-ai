import { describe, expect, it } from "vitest";
import { MAILTO_LIMIT, reminderEmails, reminderGuests, reminderMailto, reminderPhones, reminderText } from "@/lib/invites/reminders";
import type { GuestRecord } from "@/lib/invites/rsvp";
import { DEFAULT_SECTIONS, DEFAULT_VIEW, InviteDataSchema, readInviteData, standardProgram, starterInvite, type InviteData } from "@/lib/invites/schema";
import { dayAtAGlance, filledIn, resolveView, youtubeId } from "@/lib/invites/view";

function invite(over: Record<string, unknown> = {}): InviteData {
  return InviteDataSchema.parse({
    retiree: { rank: "CWO", name: "Jordan Reyes", branch: "USMC" },
    timeZone: "America/New_York",
    events: [
      { id: "cer00001", name: "Retirement Ceremony", date: "2026-11-06", start: "10:00", end: "11:30", place: "Battalion ramp", address: "Camp Lejeune, NC", onBase: true },
      { id: "pty00002", name: "Retirement Party", date: "2026-11-07", start: "19:00", place: "The Reyes home", address: "123 Ocean Drive", area: "North Topsail Beach, NC", addressPrivate: true },
    ],
    rsvp: { deadline: "2026-10-23" },
    ...over,
  });
}

let n = 0;
function guest(over: Partial<GuestRecord>): GuestRecord {
  n += 1;
  return {
    id: `g${n}`,
    email: `g${n}@example.com`,
    name: `Guest ${n}`,
    phone: null,
    answers: {},
    meals: {},
    dietary: null,
    dod_id: null,
    pass_names: null,
    pass_people: null,
    last_reminded_at: null,
    message: null,
    pipeline: {},
    previous: null,
    source: "guest",
    late: false,
    changed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

// 2026-11-06 is during US Eastern Standard Time (UTC-5).
const at = (iso: string) => new Date(iso);

describe("resolveView: which version of the page leads", () => {
  const data = invite();

  it("is the invitation before the ceremony date at the venue", () => {
    expect(resolveView(data, at("2026-11-01T12:00:00Z"))).toBe("invite");
    // 2026-11-06 03:00 UTC is still 22:00 on the 5th in North Carolina.
    expect(resolveView(data, at("2026-11-06T03:00:00Z"))).toBe("invite");
  });

  it("is the day-of version from midnight at the venue through the last event date", () => {
    expect(resolveView(data, at("2026-11-06T05:00:00Z"))).toBe("eventday");
    expect(resolveView(data, at("2026-11-07T23:00:00Z"))).toBe("eventday");
  });

  it("stays on the day-of version until 0600 after the last event, then thanks guests", () => {
    // 2026-11-08 10:59 UTC is 05:59 local.
    expect(resolveView(data, at("2026-11-08T10:59:00Z"))).toBe("eventday");
    expect(resolveView(data, at("2026-11-08T11:00:00Z"))).toBe("memories");
    expect(resolveView(data, at("2027-01-01T12:00:00Z"))).toBe("memories");
  });

  it("follows the venue's time zone, not the server's", () => {
    const hawaii = invite({ timeZone: "Pacific/Honolulu" });
    // 2026-11-06 08:00 UTC is 22:00 on the 5th in Hawaii.
    expect(resolveView(hawaii, at("2026-11-06T08:00:00Z"))).toBe("invite");
    expect(resolveView(data, at("2026-11-06T08:00:00Z"))).toBe("eventday");
  });

  it("lets the host pin a view, and an explicit ?view= beats both", () => {
    const pinned = invite({ view: { override: "memories" } });
    expect(resolveView(pinned, at("2026-11-01T12:00:00Z"))).toBe("memories");
    expect(resolveView(pinned, at("2026-11-01T12:00:00Z"), "eventday")).toBe("eventday");
    expect(resolveView(data, at("2026-11-01T12:00:00Z"), "nonsense")).toBe("invite");
  });

  it("stays on the invitation while the ceremony has no date", () => {
    // A builder draft can hold an event with no date yet; a saved one cannot.
    const blank: InviteData = { ...data, events: [{ ...data.events[0], date: "", start: "" }] };
    expect(resolveView(blank, at("2030-01-01T12:00:00Z"))).toBe("invite");
  });
});

describe("youtubeId", () => {
  it("reads the usual YouTube link shapes", () => {
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/live/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for anything else", () => {
    expect(youtubeId("")).toBeNull();
    expect(youtubeId("https://facebook.com/live/123")).toBeNull();
    expect(youtubeId("https://youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("not a link")).toBeNull();
    expect(youtubeId("https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("dayAtAGlance", () => {
  it("merges events and schedule lines in time order, defaulting undated lines to the ceremony date", () => {
    const data = invite({
      schedule: [
        { id: "sch00001", date: "2026-11-06", time: "08:30", title: "Leave the hotel for the main gate" },
        { id: "sch00002", date: "", time: "12:00", title: "Photos on the ramp" },
        { id: "sch00003", date: "2026-11-05", time: "", title: "Welcome drinks" },
      ],
    });
    expect(dayAtAGlance(data).map((line) => line.title)).toEqual([
      "Welcome drinks",
      "Leave the hotel for the main gate",
      "Retirement Ceremony",
      "Photos on the ramp",
      "Retirement Party",
    ]);
  });

  it("never shows a private street address", () => {
    const party = dayAtAGlance(invite()).find((line) => line.title === "Retirement Party");
    expect(party?.detail).not.toContain("123 Ocean Drive");
  });
});

describe("program, info, and sections in the saved data", () => {
  it("starts empty with every section on and the view following the date", () => {
    const data = starterInvite({ name: "Jordan Reyes", ceremonyDate: "2026-11-06" });
    expect(data.program.items).toEqual([]);
    expect(data.schedule).toEqual([]);
    expect(data.info).toEqual([]);
    expect(data.sections).toEqual(DEFAULT_SECTIONS);
    expect(data.view).toEqual(DEFAULT_VIEW);
    expect(data.view.override).toBe("auto");
  });

  it("offers the standard retirement sequence with stand cues", () => {
    const items = standardProgram();
    expect(items).toHaveLength(11);
    expect(items[0]).toMatchObject({ title: "Posting of the colors", cue: "Please stand", kind: "item" });
    expect(new Set(items.map((item) => item.id)).size).toBe(11);
    expect(InviteDataSchema.safeParse({ ...invite(), program: { items } }).success).toBe(true);
  });

  it("drops blank rows on save and rejects links that are not https", () => {
    const data = invite({
      program: {
        items: [
          { id: "itm00001", title: "Invocation", cue: "Remain standing" },
          { id: "itm00002", title: "" },
        ],
        people: [{ id: "ppl00001", role: "Retiring official", name: "" }],
        bios: [{ id: "bio00001", name: "CWO Jordan Reyes", short: "", full: "" }],
      },
      schedule: [{ id: "sch00001", date: "", title: "" }],
      info: [{ id: "inf00001", title: "", body: "Orphan text" }],
    });
    expect(data.program.items.map((item) => item.title)).toEqual(["Invocation"]);
    expect(data.program.people).toEqual([]);
    expect(data.program.bios).toEqual([]);
    expect(data.schedule).toEqual([]);
    expect(data.info).toEqual([]);

    expect(InviteDataSchema.safeParse({ ...invite(), program: { streamUrl: "http://youtube.com/live/abc" } }).success).toBe(false);
    expect(InviteDataSchema.safeParse({ ...invite(), program: { streamUrl: "javascript:alert(1)" } }).success).toBe(false);
    expect(InviteDataSchema.safeParse({ ...invite(), info: [{ id: "inf00001", title: "Lodging", linkUrl: "https://hotel.example/book" }] }).success).toBe(true);
  });

  it("caps the lists", () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ id: `itm${String(i).padStart(5, "0")}`, title: `Line ${i}` }));
    expect(InviteDataSchema.safeParse({ ...invite(), program: { items: many } }).success).toBe(false);
    const blocks = Array.from({ length: 7 }, (_, i) => ({ id: `inf${String(i).padStart(5, "0")}`, title: `Block ${i}` }));
    expect(InviteDataSchema.safeParse({ ...invite(), info: blocks }).success).toBe(false);
  });

  it("reads a Phase B invitation with no Phase C fields", () => {
    const old = JSON.parse(JSON.stringify(invite()));
    delete old.program;
    delete old.schedule;
    delete old.info;
    delete old.sections;
    delete old.view;
    const data = readInviteData(old);
    expect(data.events).toHaveLength(2);
    expect(data.program.items).toEqual([]);
    expect(data.sections.program).toBe(true);
    expect(data.view.override).toBe("auto");
  });

  it("keeps the rest of an invitation when one Phase C field is damaged", () => {
    const damaged = { ...JSON.parse(JSON.stringify(invite())), program: { items: "not a list" }, view: { override: "sideways" } };
    const data = readInviteData(damaged);
    expect(data.events).toHaveLength(2);
    expect(data.program.items).toEqual([]);
    expect(data.view.override).toBe("auto");
  });

  it("leaves blank builder rows out of the live preview", () => {
    const draft = { ...invite(), schedule: [{ id: "sch00001", date: "", time: "", title: "  ", note: "" }] } as InviteData;
    draft.program = { ...draft.program, items: [{ id: "itm00001", kind: "item", title: "", who: "", cue: "" }] };
    const shown = filledIn(draft);
    expect(shown.schedule).toEqual([]);
    expect(shown.program.items).toEqual([]);
  });
});

describe("reminders", () => {
  const data = invite();
  const yes = { status: "yes" as const, adults: 2, children: 0 };
  const maybe = { status: "maybe" as const, adults: 1, children: 0 };
  const no = { status: "no" as const, adults: 0, children: 0 };
  const coming = guest({ answers: { cer00001: yes }, phone: "910-555-0101" });
  const unsure = guest({ answers: { cer00001: maybe } });
  const declined = guest({ answers: { cer00001: no, pty00002: no } });
  const needsPassGuest = guest({
    email: "Host@Example.com",
    answers: { cer00001: yes },
    dod_id: "no",
    pass_people: [
      { name: "Pat Reyes", email: "pat@example.com" },
      { name: "Sam Reyes", email: "host@example.com" },
    ],
  });
  const passDone = guest({
    answers: { cer00001: yes },
    dod_id: "no",
    pass_people: [{ name: "Lee Moss", email: "lee@example.com" }],
    pipeline: { sent: true, formDone: true, inHand: true },
  });
  const all = [coming, unsure, declined, needsPassGuest, passDone];

  it("picks each group", () => {
    expect(reminderGuests(data, all, "all")).toHaveLength(5);
    expect(reminderGuests(data, all, "attending").map((g) => g.id)).toEqual([coming.id, needsPassGuest.id, passDone.id]);
    expect(reminderGuests(data, all, "maybe").map((g) => g.id)).toEqual([unsure.id]);
    expect(reminderGuests(data, all, "declined").map((g) => g.id)).toEqual([declined.id]);
    expect(reminderGuests(data, all, "pass").map((g) => g.id)).toEqual([needsPassGuest.id]);
  });

  it("writes to each adult needing a pass, once each, ignoring case", () => {
    expect(reminderEmails(reminderGuests(data, all, "pass"), "pass")).toEqual(["host@example.com", "pat@example.com"]);
    // Other groups write only to the guest who answered.
    expect(reminderEmails([needsPassGuest], "attending")).toEqual(["host@example.com"]);
  });

  it("lists mobile numbers once", () => {
    expect(reminderPhones([coming, coming, unsure])).toEqual(["910-555-0101"]);
  });

  it("words the message for the group and never includes a private address", () => {
    const url = "https://milvector.org/r/reyes";
    const maybeText = reminderText({ data, group: "maybe", note: "Two weeks out!", pageUrl: url });
    expect(maybeText.subject).toContain("Reminder: CWO Jordan Reyes's retirement");
    expect(maybeText.body.startsWith("Two weeks out!")).toBe(true);
    expect(maybeText.body).toContain("update your answer");
    expect(maybeText.body).toContain(url);
    expect(maybeText.body).not.toContain("123 Ocean Drive");
    const passText = reminderText({ data, group: "pass", note: "", pageUrl: url });
    expect(passText.subject).toContain("Action needed");
    expect(passText.body).toContain("own inbox");
  });

  it("builds a one-tap email link only while it is short enough to open", () => {
    const link = reminderMailto({ bcc: ["a@example.com", "b@example.com"], subject: "Hi", body: "Line one\nLine two" });
    expect(link).toMatch(/^mailto:\?bcc=a%40example\.com%2Cb%40example\.com&subject=Hi&body=Line%20one%0ALine%20two$/);
    const many = Array.from({ length: 120 }, (_, i) => `guest${i}@example.com`);
    expect(reminderMailto({ bcc: many, subject: "Hi", body: "x" })).toBeNull();
    expect(MAILTO_LIMIT).toBeLessThan(2000);
  });
});
