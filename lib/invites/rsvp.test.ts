import { describe, expect, it } from "vitest";
import { guestsCsv, headcounts, mealTotals, needsPass, passComplete, passNameList, retention, withText } from "@/lib/invites/guests";
import { HostGuestSchema, RsvpSubmitSchema, confirmationText, passSteps, type GuestRecord } from "@/lib/invites/rsvp";
import { DEFAULT_RSVP, InviteDataSchema, readInviteData, type InviteData } from "@/lib/invites/schema";

function invite(over: Partial<InviteData> = {}): InviteData {
  return InviteDataSchema.parse({
    retiree: { rank: "CWO", name: "Jordan Reyes", branch: "USMC" },
    events: [
      { id: "cer00001", name: "Retirement Ceremony", date: "2026-11-06", start: "10:00", end: "11:30", place: "Battalion ramp", address: "Camp Lejeune, NC", onBase: true },
      { id: "pty00002", name: "Retirement Party", date: "2026-11-06", start: "15:00", place: "The Reyes home", address: "123 Ocean Drive", area: "North Topsail Beach, NC", addressPrivate: true },
    ],
    rsvp: { deadline: "2026-10-23", meals: { enabled: true, eventId: "pty00002", options: ["Chicken", "Beef", ""] } },
    base: { passDeadline: "2026-09-25", pickup: "Collect it from Jordan at the house the morning of the ceremony." },
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

describe("RSVP settings on the invitation", () => {
  it("drops blank meal choices and keeps the rest", () => {
    expect(invite().rsvp.meals.options).toEqual(["Chicken", "Beef"]);
  });

  it("refuses meals with no choices, a missing event, or two of the same name", () => {
    const base = invite();
    const meals = (m: object) => InviteDataSchema.safeParse({ ...base, rsvp: { ...base.rsvp, meals: { ...base.rsvp.meals, ...m } } }).success;
    expect(meals({ options: ["", " "] })).toBe(false);
    expect(meals({ eventId: "gone0000" })).toBe(false);
    expect(meals({ options: ["Chicken", "chicken"] })).toBe(false);
    expect(meals({ enabled: false, options: [] })).toBe(true);
  });

  it("gives a Phase A invitation the default RSVP settings", () => {
    const old = invite() as Record<string, unknown>;
    delete old.rsvp;
    delete old.base;
    const read = readInviteData(old);
    expect(read.rsvp).toEqual(DEFAULT_RSVP);
    expect(read.rsvp.enabled).toBe(true);
    expect(read.rsvp.meals.enabled).toBe(false);
    expect(read.base.passDeadline).toBe("");
  });
});

describe("what a guest sends", () => {
  const ok = { name: "Pat Kimball", email: " Pat@Example.COM ", answers: { cer00001: { status: "yes", adults: 2, children: 1 } } };

  it("accepts a normal answer and lower-cases the email", () => {
    const parsed = RsvpSubmitSchema.parse(ok);
    expect(parsed.email).toBe("pat@example.com");
    expect(parsed.answers.cer00001).toEqual({ status: "yes", adults: 2, children: 1 });
  });

  it("clears the headcount on a no", () => {
    expect(RsvpSubmitSchema.parse({ ...ok, answers: { cer00001: { status: "no", adults: 3 } } }).answers.cer00001).toEqual({ status: "no", adults: 0, children: 0 });
  });

  it("refuses an empty answer, a yes for nobody, a party over 30, and a missing email", () => {
    expect(RsvpSubmitSchema.safeParse({ ...ok, answers: {} }).success).toBe(false);
    expect(RsvpSubmitSchema.safeParse({ ...ok, answers: { cer00001: { status: "yes", adults: 0, children: 0 } } }).success).toBe(false);
    expect(RsvpSubmitSchema.safeParse({ ...ok, answers: { cer00001: { status: "yes", adults: 31 } } }).success).toBe(false);
    expect(RsvpSubmitSchema.safeParse({ ...ok, email: "" }).success).toBe(false);
  });

  it("accepts only a well-formed personal-link secret", () => {
    expect(RsvpSubmitSchema.safeParse({ ...ok, token: "a".repeat(64) }).success).toBe(true);
    expect(RsvpSubmitSchema.safeParse({ ...ok, token: "not-a-token" }).success).toBe(false);
  });

  it("lets the host add someone with no email", () => {
    expect(HostGuestSchema.safeParse({ name: "Grandma Reyes", answers: { cer00001: { status: "yes", adults: 1 } } }).success).toBe(true);
  });
});

describe("the confirmation a guest keeps", () => {
  const data = invite();

  it("lists each answer, the released private address, and the personal link", () => {
    const text = confirmationText({
      data,
      name: "Pat",
      answers: { cer00001: { status: "yes", adults: 2, children: 0 }, pty00002: { status: "maybe", adults: 2, children: 0 } },
      addresses: { pty00002: "123 Ocean Drive, North Topsail Beach, NC" },
      dodId: "no",
      pageUrl: "https://www.milvector.org/r/x",
      personalUrl: "https://www.milvector.org/r/x?rsvp=abc",
    });
    expect(text.subject).toBe("My RSVP: CWO Jordan Reyes's retirement");
    expect(text.body).toContain("Retirement Party: Maybe, 2 adults");
    expect(text.body).toContain("The Reyes home, 123 Ocean Drive");
    expect(text.body).toContain("VISITOR PASS");
    expect(text.body).toContain("?rsvp=abc");
  });

  it("shows only the town for a private home when no address was released", () => {
    const text = confirmationText({ data, name: "Lee", answers: { pty00002: { status: "no", adults: 0, children: 0 } }, addresses: {}, dodId: "", pageUrl: "u", personalUrl: "u" });
    expect(text.body).not.toContain("Ocean Drive");
    expect(text.body).toContain("North Topsail Beach, NC");
    expect(text.body).not.toContain("VISITOR PASS");
  });

  it("walks a pass guest through the steps with the host's own pickup note", () => {
    const steps = passSteps(data).join(" ");
    expect(steps).toContain("by Friday, 25 September 2026");
    expect(steps).toContain("Jordan sends the names and that email address to the base");
    expect(steps).toContain("with an email address you check");
    expect(steps).toContain("Children do not need a pass");
    expect(steps).toContain("Collect it from Jordan");
  });
});

describe("the host's counts", () => {
  const data = invite();
  const guests = [
    guest({ answers: { cer00001: { status: "yes", adults: 2, children: 1 }, pty00002: { status: "yes", adults: 2, children: 1 } }, meals: { Chicken: 2, Beef: 1 }, dod_id: "no", pass_names: "Pat Kimball\n\nSam Kimball", dietary: "Shellfish" }),
    guest({ answers: { cer00001: { status: "maybe", adults: 1, children: 0 }, pty00002: { status: "maybe", adults: 1, children: 0 } }, meals: { Beef: 1 }, message: "Congratulations, Chief." }),
    guest({ answers: { cer00001: { status: "no", adults: 0, children: 0 }, pty00002: { status: "yes", adults: 1, children: 0 } }, meals: { Chicken: 1 }, dod_id: "no", pass_names: "Not Coming Aboard" }),
    guest({ answers: { pty00002: { status: "no", adults: 0, children: 0 } }, meals: { Chicken: 9 } }),
  ];

  it("counts yes, maybe, and no per event", () => {
    const [ceremony, party] = headcounts(data, guests);
    expect(ceremony.yes).toEqual({ parties: 1, adults: 2, children: 1 });
    expect(ceremony.maybe).toEqual({ parties: 1, adults: 1, children: 0 });
    expect(ceremony.no).toBe(1);
    expect(party.yes).toEqual({ parties: 2, adults: 3, children: 1 });
    expect(party.no).toBe(1);
  });

  it("totals meals for people coming, sure and maybe apart, and ignores a no", () => {
    expect(mealTotals(data, guests)?.totals).toEqual([
      { option: "Chicken", yes: 3, maybe: 0 },
      { option: "Beef", yes: 1, maybe: 1 },
    ]);
    expect(mealTotals(invite({ rsvp: { ...data.rsvp, meals: { enabled: false, eventId: "", options: [] } } }), guests)).toBeNull();
  });

  it("lists pass guests only when they are coming aboard", () => {
    const pass = needsPass(data, guests);
    expect(pass.map((g) => g.name)).toEqual([guests[0].name]);
    expect(passNameList(pass)).toEqual(["Pat Kimball", "Sam Kimball"]);
    expect(passComplete(pass[0])).toBe(false);
    expect(passComplete({ ...pass[0], pipeline: { sent: true, formDone: true, inHand: true } })).toBe(true);
  });

  it("collects allergies and messages", () => {
    expect(withText(guests, "dietary")).toEqual([{ name: guests[0].name, text: "Shellfish" }]);
    expect(withText(guests, "message")).toEqual([{ name: guests[1].name, text: "Congratulations, Chief." }]);
  });
});

describe("the spreadsheet", () => {
  const data = invite();

  it("has a column set the caterer can read", () => {
    const csv = guestsCsv(data, [guest({ name: "Pat, the elder", answers: { cer00001: { status: "yes", adults: 2, children: 0 } } })]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toContain("Retirement Ceremony: answer");
    expect(header).toContain("Meal: Chicken");
    expect(header).toContain("Names sent to the base");
    expect(row.startsWith('"Pat, the elder"')).toBe(true);
  });

  it("defuses anything a guest typed that a spreadsheet would run as a formula", () => {
    const csv = guestsCsv(data, [guest({ name: "=HYPERLINK(\"http://evil\")", dietary: "+1 cmd", message: "@SUM(A1)", answers: { cer00001: { status: "yes", adults: 1, children: 0 } } })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain("'+1 cmd");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

describe("retention", () => {
  it("deletes 181 days after the ceremony and warns two weeks before", () => {
    const data = invite();
    expect(retention(data, "2027-01-01")).toEqual({ deleteOn: "2027-05-06", warn: false });
    expect(retention(data, "2027-04-22")).toEqual({ deleteOn: "2027-05-06", warn: true });
    expect(retention(data, "2027-04-21")?.warn).toBe(false);
  });
});
