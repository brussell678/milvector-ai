import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeBanner, WALLET_HERO, walletHeroJpeg } from "@/lib/cards/banner";
import { cleanFollowUp, maskContactDetails, promptFollowUp } from "@/lib/cards/follow-up";
import { summarizeStats } from "@/lib/cards/insights";
import { printContactLines, renderPrintPage } from "@/lib/cards/print";
import {
  activeEvent,
  BANNER_HEIGHT,
  BANNER_JPEG_MAX_CHARS,
  BANNER_WIDTH,
  EMPTY_CARD,
  EventModeSchema,
  LeadUpdateSchema,
  readSource,
  validBannerUpload,
  type CardData,
} from "@/lib/cards/schema";

const card: CardData = {
  ...EMPTY_CARD,
  name: "Jordan A. Reyes",
  title: "Operations Manager",
  company: "Acme Logistics",
  headline: "Turns messy operations into steady ones.",
  email: "jordan@example.com",
  phone: "(910) 555-0142",
  website: "https://www.jordanreyes.com/",
  accent: "#1d4e89",
};

describe("new ways people reach a card", () => {
  it("counts video call backgrounds, printed cards, and lock screens separately", () => {
    expect(readSource("video")).toBe("video");
    expect(readSource("print")).toBe("print");
    expect(readSource("lock")).toBe("lock");
    expect(readSource("billboard")).toBe("direct");
    const insights = summarizeStats(
      [
        { day: "2026-11-20", kind: "view", source: "video", count: 3 },
        { day: "2026-11-20", kind: "view", source: "print", count: 2 },
        { day: "2026-11-21", kind: "view", source: "lock", count: 1 },
      ],
      new Date("2026-11-22T12:00:00Z"),
    );
    expect(insights.viewsBySource).toEqual([
      { source: "video", count: 3 },
      { source: "print", count: 2 },
      { source: "lock", count: 1 },
    ]);
  });
});

describe("event mode", () => {
  const now = new Date("2026-11-22T15:00:00Z");

  it("is on only until its end time, and only with a name", () => {
    expect(activeEvent("Hiring Our Heroes, Camp Lejeune", "2026-11-22T23:00:00Z", now)).toEqual({
      name: "Hiring Our Heroes, Camp Lejeune",
      until: "2026-11-22T23:00:00.000Z",
    });
    expect(activeEvent("Hiring Our Heroes", "2026-11-22T14:59:59Z", now)).toBeNull();
    expect(activeEvent("  ", "2026-11-23T00:00:00Z", now)).toBeNull();
    expect(activeEvent("Fair", "not a date", now)).toBeNull();
    expect(activeEvent(null, null, now)).toBeNull();
  });

  it("takes a named event and one of the offered lengths", () => {
    expect(EventModeSchema.safeParse({ name: "Fort Liberty career fair", hours: 24 }).success).toBe(true);
    expect(EventModeSchema.safeParse({ name: "Fort Liberty career fair", hours: 5 }).success).toBe(false);
    expect(EventModeSchema.safeParse({ name: "x", hours: 8 }).success).toBe(false);
  });

  it("lets the owner add a private note or correct the tag, but not send nothing", () => {
    expect(LeadUpdateSchema.safeParse({ ownerNote: "Wants my resume by Friday." }).success).toBe(true);
    expect(LeadUpdateSchema.safeParse({ eventName: "" }).success).toBe(true);
    expect(LeadUpdateSchema.safeParse({}).success).toBe(false);
    expect(LeadUpdateSchema.safeParse({ ownerNote: "x".repeat(501) }).success).toBe(false);
  });
});

describe("banner", () => {
  it("accepts only a JPEG upload of a sane size", () => {
    expect(validBannerUpload("/9j/4AAQSkZJRg==")).toBe(true);
    expect(validBannerUpload("iVBORw0KGgo=")).toBe(false);
    expect(validBannerUpload("/9j/" + "A".repeat(1_400_000))).toBe(false);
    expect(validBannerUpload("")).toBe(false);
  });

  it("re-encodes any image to exactly 1584 x 396 and drops its EXIF data", async () => {
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#3366aa" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "home address here" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "34/1 45/1 0/1" } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const banner = await normalizeBanner(photo);
    expect(banner).not.toBeNull();
    expect(banner!.length).toBeLessThanOrEqual(BANNER_JPEG_MAX_CHARS);
    const meta = await sharp(Buffer.from(banner!, "base64")).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([BANNER_WIDTH, BANNER_HEIGHT, "jpeg"]);
    expect(meta.exif).toBeUndefined();
  });

  it("turns away bytes that are not an image", async () => {
    expect(await normalizeBanner(Buffer.from("not an image"))).toBeNull();
  });

  it("crops to Google Wallet's 3:1 hero size", async () => {
    const banner = await normalizeBanner(await sharp({ create: { width: 1584, height: 396, channels: 3, background: "#123456" } }).png().toBuffer());
    const hero = await sharp(await walletHeroJpeg(banner!)).metadata();
    expect([hero.width, hero.height]).toEqual([WALLET_HERO.width, WALLET_HERO.height]);
  });
});

describe("follow-up email", () => {
  const lead = {
    name: "Dana Whitfield",
    company: "Northwind Freight",
    note: "Reach me at dana@northwind.com or 910-555-0199 about the ops lead role.",
    owner_note: "Hiring in Q1. Send resume. Served 2014 - 2022 herself.",
    event_name: "Hiring Our Heroes, Camp Lejeune",
    created_at: "2026-11-20T14:00:00Z",
  };

  it("masks email addresses and phone numbers but keeps year ranges", () => {
    expect(maskContactDetails("Call 910-555-0199 or (910) 555 0199, email a.b@c.co")).toBe("Call [phone] or [phone], email [email]");
    expect(maskContactDetails("Served 2014 - 2022")).toBe("Served 2014 - 2022");
  });

  it("sends the model the first name, organization, notes, and event, never the contact's details", () => {
    const prompt = promptFollowUp(card, lead);
    expect(prompt).toContain("First name: Dana");
    expect(prompt).not.toContain("Whitfield");
    expect(prompt).toContain("Organization: Northwind Freight");
    expect(prompt).toContain("Where they met: Hiring Our Heroes, Camp Lejeune");
    expect(prompt).toContain("November 20, 2026");
    expect(prompt).toContain("Reach me at [email] or [phone]");
    expect(prompt).toContain("Served 2014 - 2022 herself");
    expect(prompt).not.toMatch(/dana@northwind|555-0199/);
    expect(prompt).toContain("Name: Jordan A. Reyes");
    // The member's own contact details stay out too; their signature adds them.
    expect(prompt).not.toContain("jordan@example.com");
  });

  it("tidies the answer and rejects an empty one", () => {
    expect(cleanFollowUp({ subject: "Great meeting you \u2014 Camp Lejeune", body: "Hi Dana,\n\n\n\nIt was good to meet you \u2013 thanks.\n\nJordan" })).toEqual({
      subject: "Great meeting you, Camp Lejeune",
      body: "Hi Dana,\n\nIt was good to meet you, thanks.\n\nJordan",
    });
    expect(cleanFollowUp({ subject: "", body: "" })).toBeNull();
    expect(cleanFollowUp("nonsense")).toBeNull();
  });
});

describe("printed cards", () => {
  const args = {
    card: { ...card, name: 'Jordan "J" <Reyes>' },
    slug: "jordan-1a2b3",
    guides: false,
    qrSvg: "<svg data-qr></svg>",
    photoSrc: "/c/jordan-1a2b3/photo",
    bannerSrc: "/c/jordan-1a2b3/banner?t=1",
    shortUrl: "milvector.org/c/jordan-1a2b3",
  };

  it("lays out 10 fronts and 10 backs on US Letter card stock", () => {
    const html = renderPrintPage({ ...args, layout: "sheet" });
    expect(html).toContain("@page { size: 8.5in 11in; margin: 0; }");
    expect(html.match(/class="card front"/g)).toHaveLength(10);
    expect(html.match(/class="card back"/g)).toHaveLength(10);
    expect(html.match(/<section class="page sheet">/g)).toHaveLength(2);
    expect(html).toContain("padding: 0.5in 0.75in");
    expect(html).not.toContain("outline: 0.5pt dashed");
    expect(renderPrintPage({ ...args, layout: "sheet", guides: true })).toContain("outline: 0.5pt dashed");
  });

  it("makes a front and a back with bleed for a print shop", () => {
    const html = renderPrintPage({ ...args, layout: "shop" });
    expect(html).toContain("@page { size: 3.75in 2.25in; margin: 0; }");
    expect(html.match(/class="card front"/g)).toHaveLength(1);
    expect(html.match(/class="card back"/g)).toHaveLength(1);
    expect(html).toContain(".shop .card { --bleed: 0.125in; }");
  });

  it("escapes the card's text and puts the QR code and address on the back", () => {
    const html = renderPrintPage({ ...args, layout: "shop" });
    expect(html).toContain("Jordan &quot;J&quot; &lt;Reyes&gt;");
    expect(html).not.toContain("<Reyes>");
    expect(html).toContain("<svg data-qr></svg>");
    expect(html).toContain("milvector.org/c/jordan-1a2b3");
    expect(html).not.toMatch(/[\u2014\u2013]/);
  });

  it("prints phone, email, and a web address, preferring the website over LinkedIn", () => {
    expect(printContactLines(card)).toEqual([
      { label: "Phone", value: "+1 (910) 555-0142" },
      { label: "Email", value: "jordan@example.com" },
      { label: "Web", value: "jordanreyes.com" },
    ]);
    const linkedinOnly = { ...card, website: "", links: [{ type: "linkedin" as const, label: "", url: "https://www.linkedin.com/in/jreyes" }] };
    expect(printContactLines(linkedinOnly).at(-1)).toEqual({ label: "Web", value: "linkedin.com/in/jreyes" });
  });
});
