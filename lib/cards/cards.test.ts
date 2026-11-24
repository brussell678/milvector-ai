import { createHash, createVerify, generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { cardUrl, shortCardUrl } from "@/lib/cards/access";
import { appleConfig, appleSetupProblems, buildApplePass, buildPassJson, readPem } from "@/lib/cards/apple-pass";
import { buildGoogleObject, FACE_PHONE_MODULE, googleClass, googleConfig, googleSaveJwt, googleSaveUrl, googleSetupProblems } from "@/lib/cards/google-pass";
import { leadsCsv, summarizeStats } from "@/lib/cards/insights";
import { opsecWarnings, piiProblem } from "@/lib/cards/opsec";
import {
  CardDataSchema,
  displayPhone,
  EMPTY_CARD,
  LeadSchema,
  qrColor,
  readCardData,
  readSource,
  safeHttpsUrl,
  slugFromName,
  slugProblem,
  telDigits,
  textOnColor,
  validPhoto,
  type CardData,
} from "@/lib/cards/schema";
import { DOCX_MIME, matchesMime, PDF_MIME, RESUME_MAX_BYTES, resumeDownloadName, resumeOptions } from "@/lib/cards/resume";
import { buildVCard, savedOnLabel, vcardFilename } from "@/lib/cards/vcard";
import { crc32, zipStore } from "@/lib/cards/zip";

const card: CardData = {
  ...EMPTY_CARD,
  name: "Jordan A. Reyes",
  title: "Operations Manager",
  company: "Reyes Logistics, LLC",
  service: "U.S. Marine Corps Veteran",
  headline: "20 years leading logistics teams; PMP",
  email: "jordan@example.com",
  phone: "(910) 555-0142",
  website: "https://example.com/",
  location: "Jacksonville, NC",
  links: [{ type: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/in/jordan-reyes" }],
};

describe("card schema", () => {
  it("accepts a complete card and fills defaults on a minimal one", () => {
    expect(CardDataSchema.safeParse(card).success).toBe(true);
    const minimal = CardDataSchema.parse({ name: "Sam Lee" });
    expect(minimal.links).toEqual([]);
    expect(minimal.leadCapture).toBe(true);
    expect(minimal.style).toBe("band");
    expect(minimal.passShowPhone).toBe(false);
  });

  it("formats a phone for reading and for dialing", () => {
    expect(displayPhone("4023008919")).toBe("+1 (402) 300-8919");
    expect(displayPhone("402-300-8919")).toBe("+1 (402) 300-8919");
    expect(displayPhone("+1 402 300 8919")).toBe("+1 (402) 300-8919");
    expect(displayPhone("1 (402) 300-8919")).toBe("+1 (402) 300-8919");
    expect(displayPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(displayPhone("910-555-0142 x12")).toBe("910-555-0142 x12");
    expect(telDigits("(402) 300-8919")).toBe("4023008919");
    expect(telDigits("+1 402 300 8919")).toBe("+14023008919");
  });

  it("gives the card address as people read it", () => {
    expect(shortCardUrl("brandon-russell")).toBe("milvector.org/c/brandon-russell");
  });

  it("rejects a missing name, a bad color, and too many links", () => {
    expect(CardDataSchema.safeParse({ ...card, name: " " }).success).toBe(false);
    expect(CardDataSchema.safeParse({ ...card, accent: "red" }).success).toBe(false);
    const links = Array.from({ length: 9 }, () => card.links[0]);
    expect(CardDataSchema.safeParse({ ...card, links }).success).toBe(false);
  });

  it("only allows https links", () => {
    expect(safeHttpsUrl("linkedin.com/in/x")).toBe("https://linkedin.com/in/x");
    expect(safeHttpsUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHttpsUrl("http://example.com")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("data:text/html,x")).toBeNull();
    expect(safeHttpsUrl("https://user:pw@example.com")).toBeNull();
    expect(safeHttpsUrl("https://localhost")).toBeNull();
    expect(CardDataSchema.safeParse({ ...card, website: "javascript:alert(1)" }).success).toBe(false);
    expect(CardDataSchema.safeParse({ ...card, links: [{ type: "other", label: "x", url: "http://example.com" }] }).success).toBe(false);
  });

  it("validates phone and email but lets them be blank", () => {
    expect(CardDataSchema.safeParse({ ...card, phone: "", email: "" }).success).toBe(true);
    expect(CardDataSchema.safeParse({ ...card, phone: "call me" }).success).toBe(false);
    expect(CardDataSchema.safeParse({ ...card, email: "nope" }).success).toBe(false);
    expect(CardDataSchema.safeParse({ ...card, phone: "+1 910-555-0142 x12" }).success).toBe(true);
  });

  it("strips control characters from text", () => {
    expect(CardDataSchema.parse({ ...card, title: "Ops\u0000 Lead\u0007" }).title).toBe("Ops Lead");
  });

  it("reads a damaged stored row without throwing", () => {
    const read = readCardData({ name: "Sam Lee", accent: "bogus", links: "nope", title: "Analyst" });
    expect(read.name).toBe("Sam Lee");
    expect(read.title).toBe("Analyst");
    expect(read.accent).toBe(EMPTY_CARD.accent);
    expect(read.links).toEqual([]);
    expect(readCardData(null).name).toBe("");
  });
});

describe("slugs", () => {
  it("builds an address from a name", () => {
    expect(slugFromName("Jordan A. Reyes", "a1b2c")).toBe("jordan-a-reyes-a1b2c");
    expect(slugFromName("José Núñez", "a1b2c")).toBe("jose-nunez-a1b2c");
    expect(slugFromName("!!!", "a1b2c")).toBe("card-a1b2c");
    expect(slugProblem(slugFromName("x".repeat(80), "a1b2c"))).toBeNull();
  });

  it("rejects bad and reserved addresses", () => {
    expect(slugProblem("jordan-reyes")).toBeNull();
    expect(slugProblem("ab")).not.toBeNull();
    expect(slugProblem("-jordan")).not.toBeNull();
    expect(slugProblem("Jordan")).not.toBeNull();
    expect(slugProblem("jordan--reyes")).not.toBeNull();
    expect(slugProblem("admin")).not.toBeNull();
    expect(slugProblem("milvector")).not.toBeNull();
  });

  it("tags the address with where the visit came from", () => {
    expect(cardUrl("jordan")).toBe("https://www.milvector.org/c/jordan");
    expect(cardUrl("jordan", "qr")).toBe("https://www.milvector.org/c/jordan?s=qr");
    expect(cardUrl("jordan", "direct")).toBe("https://www.milvector.org/c/jordan");
    expect(readSource("qr")).toBe("qr");
    expect(readSource("evil")).toBe("direct");
    expect(readSource(undefined)).toBe("direct");
  });
});

describe("photos and colors", () => {
  it("accepts only real JPEG and PNG data within the size cap", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]).toString("base64");
    expect(validPhoto(jpeg, "jpeg")).toBe(true);
    expect(validPhoto(png, "png")).toBe(true);
    expect(validPhoto(png, "jpeg")).toBe(false);
    expect(validPhoto("<svg onload=alert(1)>", "png")).toBe(false);
    expect(validPhoto("/9j/" + "A".repeat(300_000), "jpeg")).toBe(false);
    expect(validPhoto("", "jpeg")).toBe(false);
  });

  it("picks readable text and a scannable QR color", () => {
    expect(textOnColor("#0f172a")).toBe("#ffffff");
    expect(textOnColor("#ffe45c")).toBe("#0b1220");
    expect(qrColor("#1d4e89")).toBe("#1d4e89");
    expect(qrColor("#ffe45c")).toBe("#0b1220");
  });
});

describe("vCard", () => {
  const vcf = buildVCard(card, "https://www.milvector.org/c/jordan", null);

  it("carries the contact fields with CRLF line endings", () => {
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(vcf.endsWith("END:VCARD\r\n")).toBe(true);
    expect(vcf).toContain("FN:Jordan A. Reyes");
    expect(vcf).toContain("N:Reyes;Jordan;A.;;");
    expect(vcf).toContain("TEL;TYPE=CELL,VOICE:(910) 555-0142");
    expect(vcf).toContain("EMAIL;TYPE=INTERNET,WORK:jordan@example.com");
  });

  it("puts the card link first among the links, labeled, and says where the contact came from", () => {
    const saved = buildVCard(card, "https://www.milvector.org/c/jordan?s=contact", null, "November 23, 2026");
    const lines = saved.replace(/\r\n /g, "").split("\r\n");
    const firstUrl = lines.findIndex((line) => /URL/.test(line));
    expect(lines[firstUrl]).toBe("item1.URL;TYPE=pref:https://www.milvector.org/c/jordan?s=contact");
    expect(lines[firstUrl + 1]).toBe("item1.X-ABLabel:Digital card");
    expect(lines.find((line) => line.startsWith("NOTE:"))).toBe(
      "NOTE:Saved November 23\\, 2026 from Jordan's digital card: https://www.milvector.org/c/jordan?s=contact\\n20 years leading logistics teams\\; PMP | U.S. Marine Corps Veteran",
    );
    expect(vcf).toContain("NOTE:From Jordan's digital card: https://www.milvector.org/c/jordan");
  });

  it("takes the visitor's save date only when it is a real, current day", () => {
    const now = new Date("2026-11-23T03:00:00Z");
    expect(savedOnLabel("2026-11-22", now)).toBe("November 22, 2026");
    expect(savedOnLabel("2026-11-23", now)).toBe("November 23, 2026");
    expect(savedOnLabel("2026-02-30", now)).toBeNull();
    expect(savedOnLabel("2025-11-23", now)).toBeNull();
    expect(savedOnLabel("Nov 23", now)).toBeNull();
    expect(savedOnLabel(null, now)).toBeNull();
  });

  it("escapes commas, semicolons, and line breaks", () => {
    expect(vcf).toContain("ORG:Reyes Logistics\\, LLC");
    expect(vcf.replace(/\r\n /g, "")).toContain("\\n20 years leading logistics teams\\; PMP | U.S. Marine Corps Veteran");
    const injected = buildVCard({ ...card, title: "Lead\nEND:VCARD\nBEGIN:VCARD" }, "https://x.example/c/a", null);
    expect(injected.match(/^BEGIN:VCARD/gm)?.length).toBe(1);
    expect(injected.match(/^END:VCARD/gm)?.length).toBe(1);
  });

  it("folds long lines to 75 bytes and embeds a photo", () => {
    const photo = "/9j/" + "A".repeat(400);
    const withPhoto = buildVCard(card, "https://www.milvector.org/c/jordan", photo);
    for (const line of withPhoto.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(withPhoto.replace(/\r\n /g, "")).toContain(`PHOTO;ENCODING=b;TYPE=JPEG:${photo}`);
    expect(vcardFilename("Jordan A. Reyes")).toBe("Jordan-A-Reyes.vcf");
    expect(vcardFilename("???")).toBe("contact.vcf");
  });
});

describe("contact exchange", () => {
  it("needs a name and an email or a phone", () => {
    expect(LeadSchema.safeParse({ name: "Pat Kim", email: "pat@example.com" }).success).toBe(true);
    expect(LeadSchema.safeParse({ name: "Pat Kim", phone: "910-555-0100" }).success).toBe(true);
    expect(LeadSchema.safeParse({ name: "Pat Kim" }).success).toBe(false);
    expect(LeadSchema.safeParse({ name: "P", email: "pat@example.com" }).success).toBe(false);
  });

  it("writes a CSV that a spreadsheet will not execute", () => {
    const csv = leadsCsv([
      { name: '=HYPERLINK("http://evil")', email: "a@b.co", phone: null, company: 'Acme "East"', note: "+1 back", source: "qr", created_at: "2026-11-14T10:00:00Z" },
    ]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("Name,Email,Phone,Organization,Their note,My notes,Event,Came from,Date");
    expect(row).toContain(`"QR code"`);
    expect(row.startsWith(`"'=HYPERLINK(""http://evil"")"`)).toBe(true);
    expect(row).toContain(`"Acme ""East"""`);
    expect(row).toContain(`"'+1 back"`);
    expect(row.endsWith(`"2026-11-14"`)).toBe(true);
  });
});

describe("insights", () => {
  const today = new Date("2026-11-14T15:00:00Z");
  const stats = summarizeStats(
    [
      { day: "2026-11-14", kind: "view", source: "qr", count: 6 },
      { day: "2026-11-14", kind: "view", source: "direct", count: 4 },
      { day: "2026-11-13", kind: "save", source: "qr", count: 3 },
      { day: "2026-11-01", kind: "link", source: "direct", count: 5 },
      { day: "2026-10-01", kind: "apple", source: "direct", count: 1 },
      { day: "2026-10-01", kind: "google", source: "direct", count: 2 },
      { day: "2026-10-02", kind: "resume", source: "qr", count: 4 },
      { day: "2026-09-01", kind: "view", source: "nfc", count: 10 },
    ],
    today,
  );

  it("totals each kind of activity", () => {
    expect(stats.views).toBe(20);
    expect(stats.saves).toBe(3);
    expect(stats.linkTaps).toBe(5);
    expect(stats.walletAdds).toBe(3);
    expect(stats.resumeDownloads).toBe(4);
    expect(stats.saveRate).toBe(15);
    expect(stats.viewsBySource).toEqual([
      { source: "direct", count: 4 },
      { source: "qr", count: 6 },
      { source: "nfc", count: 10 },
    ]);
  });

  it("returns 30 days, oldest first, with empty days filled", () => {
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily[0].day).toBe("2026-10-16");
    expect(stats.daily[29]).toEqual({ day: "2026-11-14", views: 10, saves: 0 });
    expect(stats.daily[28]).toEqual({ day: "2026-11-13", views: 0, saves: 3 });
  });

  it("has no save rate without views", () => {
    expect(summarizeStats([], today).saveRate).toBeNull();
  });
});

describe("OPSEC checks", () => {
  it("blocks a Social Security number and a labeled DoD ID", () => {
    expect(piiProblem(card)).toBeNull();
    expect(piiProblem({ ...card, bio: "SSN 123-45-6789" })).toMatch(/Social Security/);
    expect(piiProblem({ ...card, bio: "DoD ID 1234567890" })).toMatch(/DoD ID/);
  });

  it("does not mistake the phone number field for an ID", () => {
    expect(piiProblem({ ...card, phone: "9105550142" })).toBeNull();
  });

  it("warns about clearance, street addresses, duty stations, and .mil email", () => {
    expect(opsecWarnings(card)).toEqual([]);
    expect(opsecWarnings({ ...card, headline: "Active TS/SCI" })).toHaveLength(1);
    expect(opsecWarnings({ ...card, location: "412 Gum Branch Road" })).toHaveLength(1);
    expect(opsecWarnings({ ...card, bio: "Currently stationed at Camp Lejeune" })).toHaveLength(1);
    expect(opsecWarnings({ ...card, email: "jordan.reyes@usmc.mil" })).toHaveLength(1);
  });
});

// ─── Wallet passes ───────────────────────────────────────────────────

function selfSigned(commonName: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 30);
  const attrs = [{ name: "commonName", value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

// A stand-in Pass Type ID certificate, with the UID an Apple one carries.
function passCert(typeId: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 30);
  const attrs = [{ type: "0.9.2342.19200300.100.1.1", value: typeId }, { name: "commonName", value: `Pass Type ID: ${typeId}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

describe("wallet setup check (the admin's Share tab)", () => {
  it("names every missing setting, never a value", () => {
    expect(appleSetupProblems({} as NodeJS.ProcessEnv)).toEqual([
      "APPLE_PASS_TYPE_ID is not set.",
      "APPLE_TEAM_ID is not set.",
      "APPLE_PASS_CERT is not set.",
      "APPLE_PASS_KEY is not set.",
      "APPLE_WWDR_CERT is not set.",
    ]);
    expect(googleSetupProblems({} as NodeJS.ProcessEnv)).toHaveLength(3);
  });

  it("says when a file value is not a PEM, when the pieces do not belong together, and is quiet when all is well", () => {
    const good = passCert("pass.pass.org.milvector.card");
    const other = passCert("pass.pass.org.milvector.card");
    const wwdr = selfSigned("Test WWDR");
    const env = { APPLE_PASS_TYPE_ID: "pass.pass.org.milvector.card", APPLE_TEAM_ID: "ABCDE12345", APPLE_PASS_CERT: good.certPem, APPLE_PASS_KEY: good.keyPem, APPLE_WWDR_CERT: wwdr.certPem };
    expect(appleSetupProblems(env as unknown as NodeJS.ProcessEnv)).toEqual([]);
    expect(appleSetupProblems({ ...env, APPLE_WWDR_CERT: "pasted the wrong thing" } as unknown as NodeJS.ProcessEnv)).toEqual([
      "APPLE_WWDR_CERT is set, but it does not read as a PEM file (it should begin with the BEGIN line).",
    ]);
    expect(appleSetupProblems({ ...env, APPLE_PASS_KEY: other.keyPem } as unknown as NodeJS.ProcessEnv)).toEqual(["APPLE_PASS_CERT and APPLE_PASS_KEY do not belong together."]);
    expect(appleSetupProblems({ ...env, APPLE_PASS_TYPE_ID: "pass.org.milvector.card" } as unknown as NodeJS.ProcessEnv)[0]).toMatch(/^APPLE_PASS_TYPE_ID does not match the certificate \(pass\.pass\.org\.milvector\.card\)\.$/);
    const joined = appleSetupProblems({ ...env, APPLE_PASS_KEY: other.keyPem } as unknown as NodeJS.ProcessEnv).join(" ");
    expect(joined).not.toContain("BEGIN RSA");
  }, 60_000);
});

// Reads a stored (uncompressed) ZIP back into its files.
function unzip(zip: Buffer) {
  const files: Record<string, Buffer> = {};
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const data = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(crc32(data)).toBe(zip.readUInt32LE(offset + 14));
    files[name] = data;
    offset += 30 + nameLength + size;
  }
  return files;
}

describe("ZIP writer", () => {
  it("matches the standard CRC-32 check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips files and writes a valid end record", () => {
    const zip = zipStore([
      { name: "a.txt", data: Buffer.from("hello") },
      { name: "b.json", data: Buffer.from("{}") },
    ]);
    const files = unzip(zip);
    expect(files["a.txt"].toString()).toBe("hello");
    expect(files["b.json"].toString()).toBe("{}");
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    expect(zip.readUInt32LE(zip.readUInt32LE(end + 16))).toBe(0x02014b50);
  });
});

describe("Apple Wallet pass", () => {
  it("is off unless every setting is present, and reads PEM or base64 PEM", () => {
    expect(appleConfig({} as NodeJS.ProcessEnv)).toBeNull();
    const pem = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
    expect(readPem(pem)).toBe(pem);
    expect(readPem(Buffer.from(pem).toString("base64"))).toBe(pem);
    expect(readPem(pem.replace(/\n/g, "\\n"))).toBe(pem);
    expect(readPem("not a key")).toBeNull();
    const env = { APPLE_PASS_CERT: pem, APPLE_PASS_KEY: pem, APPLE_WWDR_CERT: pem, APPLE_PASS_TYPE_ID: "pass.org.milvector.card" };
    expect(appleConfig(env as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(appleConfig({ ...env, APPLE_TEAM_ID: "ABCDE12345" } as unknown as NodeJS.ProcessEnv)?.teamId).toBe("ABCDE12345");
  });

  it("describes the card and points its QR code at the live page", () => {
    const json = buildPassJson({ card, slug: "jordan", cardId: "id-1", config: { passTypeId: "pass.org.milvector.card", teamId: "ABCDE12345" } });
    expect(json.passTypeIdentifier).toBe("pass.org.milvector.card");
    expect(json.serialNumber).toBe("id-1");
    expect(json.generic.primaryFields[0].value).toBe("Jordan A. Reyes");
    expect(json.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: "https://www.milvector.org/c/jordan?s=wallet", altText: "milvector.org/c/jordan" });
    expect(json.backgroundColor).toBe("rgb(31, 111, 84)");
    expect(json.foregroundColor).toBe("rgb(255, 255, 255)");
  });

  it("keeps phone and email off the front unless the owner shows the phone", () => {
    const config = { passTypeId: "pass.org.milvector.card", teamId: "ABCDE12345" };
    const plain = buildPassJson({ card, slug: "jordan", cardId: "id-1", config });
    expect(plain.generic.auxiliaryFields).toEqual([]);
    const back = Object.fromEntries((plain.generic.backFields as { key: string; value: string }[]).map((f) => [f.key, f.value]));
    expect(back["b-phone"]).toBe("+1 (910) 555-0142");
    expect(back["b-email"]).toBe("jordan@example.com");
    const shown = buildPassJson({ card: { ...card, passShowPhone: true }, slug: "jordan", cardId: "id-1", config });
    expect(shown.generic.auxiliaryFields).toEqual([{ key: "phone", label: "PHONE", value: "+1 (910) 555-0142" }]);
    expect(buildPassJson({ card: { ...card, phone: "", passShowPhone: true }, slug: "jordan", cardId: "id-1", config }).generic.auxiliaryFields).toEqual([]);
  });

  it("builds a signed package whose manifest matches every file", () => {
    const signer = selfSigned("Pass Type ID: pass.test");
    const wwdr = selfSigned("Test WWDR");
    const photo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");
    const pass = buildApplePass({
      card,
      slug: "jordan",
      cardId: "id-1",
      photoPngBase64: photo,
      config: { passTypeId: "pass.test", teamId: "TEAM123456", certPem: signer.certPem, keyPem: signer.keyPem, wwdrPem: wwdr.certPem },
    });
    const files = unzip(pass);
    for (const required of ["pass.json", "icon.png", "icon@2x.png", "logo.png", "thumbnail.png", "manifest.json", "signature"]) {
      expect(files[required], required).toBeDefined();
    }
    const manifest = JSON.parse(files["manifest.json"].toString()) as Record<string, string>;
    expect(Object.keys(manifest).sort()).toEqual(Object.keys(files).filter((n) => n !== "manifest.json" && n !== "signature").sort());
    for (const [name, hash] of Object.entries(manifest)) {
      expect(createHash("sha1").update(files[name]).digest("hex"), name).toBe(hash);
    }

    // The signature is a detached PKCS#7 over the manifest, carrying both certificates.
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(files["signature"].toString("binary"))) as forge.pkcs7.PkcsSignedData;
    expect(p7.certificates).toHaveLength(2);
    const names = p7.certificates.map((c) => c.subject.getField("CN").value);
    expect(names).toContain("Pass Type ID: pass.test");
    expect(names).toContain("Test WWDR");
  }, 30_000);
});

describe("Google Wallet pass", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const config = {
    issuerId: "3388000000012345678",
    serviceAccountEmail: "milvector-wallet@milvector-production.iam.gserviceaccount.com",
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  const args = { card, slug: "jordan", cardId: "3f1c9a2e-0000-4000-8000-000000000001", hasPhoto: true };
  const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  const verifies = (jwt: string) => {
    const [head, body, signature] = jwt.split(".");
    return createVerify("RSA-SHA256").update(`${head}.${body}`).verify(publicKey, Buffer.from(signature, "base64url"));
  };

  it("is off unless every setting is present", () => {
    expect(googleConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(googleConfig({ GOOGLE_WALLET_ISSUER_ID: "1", GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL: "a@b.co" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("describes the card and points its QR code at the live page", () => {
    const object = buildGoogleObject({ ...args, issuerId: config.issuerId }, true);
    expect(object.id).toBe("3388000000012345678.card_3f1c9a2e000040008000000000000001");
    expect(object.classId).toBe("3388000000012345678.milvector_business_card");
    expect(object.barcode.value).toBe("https://www.milvector.org/c/jordan?s=wallet");
    expect(object.barcode.alternateText).toBe("milvector.org/c/jordan");
    expect(object.logo.sourceUri.uri).toBe("https://www.milvector.org/c/jordan/photo");
    expect(object.header.defaultValue.value).toBe("Jordan A. Reyes");
    expect(object.linksModuleData.uris.map((u) => u.id)).toEqual(["phone", "email", "card", "web", "link0"]);
    expect(buildGoogleObject({ ...args, issuerId: config.issuerId }, false).linksModuleData.uris.map((u) => u.id)).toEqual(["phone", "email", "card"]);
  });

  it("makes the phone and email tappable in the details, never plain text", () => {
    const object = buildGoogleObject({ ...args, card: { ...card, phone: "910.555.0142" }, issuerId: config.issuerId }, true);
    const links = Object.fromEntries(object.linksModuleData.uris.map((u) => [u.id, u]));
    expect(links.phone).toEqual({ id: "phone", uri: "tel:9105550142", description: "+1 (910) 555-0142" });
    expect(links.email).toEqual({ id: "email", uri: "mailto:jordan@example.com", description: "jordan@example.com" });
    expect(object.textModulesData.map((t) => (t as { id: string }).id)).toEqual(["about", "location"]);
    const bare = buildGoogleObject({ ...args, card: { ...card, phone: "", email: "" }, issuerId: config.issuerId }, true);
    expect(bare.linksModuleData.uris.map((u) => u.id)).toEqual(["card", "web", "link0"]);
  });

  it("shows the phone on the front only when the owner chose it", () => {
    const face = (c: CardData, full = true) => buildGoogleObject({ ...args, card: c, issuerId: config.issuerId }, full).textModulesData.find((t) => (t as { id: string }).id === FACE_PHONE_MODULE);
    expect(face(card)).toBeUndefined();
    expect(face({ ...card, passShowPhone: true })).toEqual({ id: FACE_PHONE_MODULE, header: "Phone", body: "+1 (910) 555-0142" });
    expect(face({ ...card, passShowPhone: true }, false)).toEqual({ id: FACE_PHONE_MODULE, header: "Phone", body: "+1 (910) 555-0142" });
    expect(face({ ...card, phone: "", passShowPhone: true })).toBeUndefined();
    // The shared class shows that module as one row on the front; a pass without it has no row.
    const passClass = googleClass("3388000000012345678.milvector_business_card");
    expect(passClass.classTemplateInfo.cardTemplateOverride.cardRowTemplateInfos).toEqual([
      { oneItem: { item: { firstValue: { fields: [{ fieldPath: `object.textModulesData['${FACE_PHONE_MODULE}']` }] } } } },
    ]);
  });

  it("lists every detail a pass can carry, except the front-row phone", () => {
    const passClass = googleClass("3388000000012345678.milvector_business_card");
    const paths = passClass.classTemplateInfo.detailsTemplateOverride.detailsItemInfos.map((d) => d.item.firstValue.fields[0].fieldPath);
    expect(paths.some((p) => p.includes(FACE_PHONE_MODULE))).toBe(false);
    const full = { ...card, passShowPhone: true, links: Array.from({ length: 8 }, (_, i) => ({ type: "other" as const, label: `L${i}`, url: `https://example.com/${i}` })) };
    const object = buildGoogleObject({ ...args, card: full, issuerId: config.issuerId }, true);
    for (const t of object.textModulesData as { id: string }[]) {
      if (t.id !== FACE_PHONE_MODULE) expect(paths, t.id).toContain(`object.textModulesData['${t.id}']`);
    }
    for (const u of object.linksModuleData.uris) expect(paths, u.id).toContain(`object.linksModuleData.uris['${u.id}']`);
  });

  it("registers the pass with Google and hands out a short signed link", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("oauth2")) return Response.json({ access_token: "token-1" });
      if (url.includes("/genericClass/") && init?.method === "PUT") return Response.json({});
      if (init?.method === "PUT") return new Response("{}", { status: 404 });
      return Response.json({});
    }) as typeof fetch;

    const result = await googleSaveUrl({ ...args, config }, fetcher);
    expect(result.mode).toBe("registered");
    // Token, the class brought up to date (it carries the front-row template), then the pass.
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "PUT", "POST"]);
    expect(calls[1].url).toContain("/genericClass/3388000000012345678.milvector_business_card");
    expect(calls[2].url).toContain("/genericObject/3388000000012345678.card_3f1c9a2e000040008000000000000001");

    const jwt = result.url.replace("https://pay.google.com/gp/v/save/", "");
    expect(verifies(jwt)).toBe(true);
    const claims = decode(jwt);
    expect(claims).toMatchObject({ aud: "google", typ: "savetowallet", iss: config.serviceAccountEmail, origins: ["https://www.milvector.org"] });
    expect(claims.payload.genericObjects).toEqual([{ id: "3388000000012345678.card_3f1c9a2e000040008000000000000001", classId: "3388000000012345678.milvector_business_card" }]);
    expect(result.url.length).toBeLessThan(1000);
  });

  it("creates the class the first time", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("oauth2")) return Response.json({ access_token: "token-1" });
      if (init?.method === "PUT") return new Response("{}", { status: 404 });
      return Response.json({});
    }) as typeof fetch;
    const result = await googleSaveUrl({ ...args, config }, fetcher);
    expect(result.mode).toBe("registered");
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "POST", "PUT", "POST"]);
    expect(calls[2].url.endsWith("/genericClass")).toBe(true);
    expect(JSON.parse(calls[2].body ?? "{}")).toEqual(googleClass("3388000000012345678.milvector_business_card"));
  });

  it("falls back to a pass carried in the link when Google's API is unreachable", async () => {
    const down = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    const result = await googleSaveUrl({ ...args, config }, down);
    expect(result.mode).toBe("embedded");
    const jwt = result.url.replace("https://pay.google.com/gp/v/save/", "");
    expect(verifies(jwt)).toBe(true);
    const claims = decode(jwt);
    expect(claims.payload.genericClasses).toEqual([{ id: "3388000000012345678.milvector_business_card" }]);
    expect(claims.payload.genericObjects[0].header.defaultValue.value).toBe("Jordan A. Reyes");
    // Google asks for save links under about 1,800 characters, even with the phone on the front.
    expect(result.url.length).toBeLessThan(1800);
    const shown = await googleSaveUrl({ ...args, card: { ...card, passShowPhone: true }, config }, down);
    expect(shown.url.length).toBeLessThan(1800);
    const shownClaims = decode(shown.url.replace("https://pay.google.com/gp/v/save/", ""));
    expect(shownClaims.payload.genericObjects[0].textModulesData).toEqual([{ id: FACE_PHONE_MODULE, header: "Phone", body: "+1 (910) 555-0142" }]);
    // Every field at its longest still fits: the extras give way, never the name or the code.
    const long = { ...card, name: "N".repeat(80), title: "T".repeat(80), company: "C".repeat(80), phone: "+1 (910) 555-0142 x1234", email: `${"e".repeat(100)}@example.com`, passShowPhone: true };
    const longest = await googleSaveUrl({ ...args, card: long, config }, down);
    expect(longest.url.length).toBeLessThan(1800);
    const longObject = decode(longest.url.replace("https://pay.google.com/gp/v/save/", "")).payload.genericObjects[0];
    expect(longObject.header.defaultValue.value).toBe("N".repeat(80));
    expect(longObject.barcode.value).toBe("https://www.milvector.org/c/jordan?s=wallet");
  });

  it("shows the banner as the pass's wide image when the card has one", () => {
    const withBanner = buildGoogleObject({ ...args, issuerId: config.issuerId, bannerVersion: "2026-11-23T03:00:00.000Z" }, true);
    expect(withBanner.heroImage?.sourceUri.uri).toBe("https://www.milvector.org/c/jordan/banner?v=wallet&t=2026-11-23T03%3A00%3A00.000Z");
    expect(buildGoogleObject({ ...args, issuerId: config.issuerId }, true).heroImage).toBeUndefined();
    // The trimmed pass inside a save link stays short: no banner.
    expect(buildGoogleObject({ ...args, issuerId: config.issuerId, bannerVersion: "2026-11-23T03:00:00.000Z" }, false).heroImage).toBeUndefined();
  });

  it("signs the save link so Google can verify it", () => {
    const jwt = googleSaveJwt(config, [{ id: "a", classId: "b" }], [], 1_800_000_000);
    expect(JSON.parse(Buffer.from(jwt.split(".")[0], "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(jwt).iat).toBe(1_800_000_000);
    expect(verifies(jwt)).toBe(true);
  });
});

describe("resume on a card", () => {
  const doc = (over: Record<string, unknown>) => ({
    id: "1",
    filename: "resume.pdf",
    doc_type: "MASTER_RESUME",
    mime_type: PDF_MIME,
    size_bytes: 200_000,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  });

  it("offers only PDF and Word files within the size limit", () => {
    const options = resumeOptions([
      doc({ id: "pdf" }),
      doc({ id: "word", mime_type: DOCX_MIME, filename: "resume.docx" }),
      doc({ id: "text", mime_type: "text/plain", filename: "master.txt" }),
      doc({ id: "huge", size_bytes: RESUME_MAX_BYTES + 1 }),
    ]);
    expect(options.map((o) => o.id)).toEqual(["pdf", "word"]);
  });

  it("lists PDFs first, then master before targeted, then newest", () => {
    const options = resumeOptions([
      doc({ id: "word-master", mime_type: DOCX_MIME }),
      doc({ id: "pdf-targeted", doc_type: "TARGETED_RESUME" }),
      doc({ id: "pdf-master-old", created_at: "2026-01-01T00:00:00Z" }),
      doc({ id: "pdf-master-new", created_at: "2026-11-10T00:00:00Z" }),
    ]);
    expect(options.map((o) => o.id)).toEqual(["pdf-master-new", "pdf-master-old", "pdf-targeted", "word-master"]);
    expect(options[2].kind).toBe("targeted");
  });

  it("checks the file really is what it claims to be", () => {
    expect(matchesMime(Buffer.from("%PDF-1.7 ..."), PDF_MIME)).toBe(true);
    expect(matchesMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), DOCX_MIME)).toBe(true);
    expect(matchesMime(Buffer.from("<html><script>"), PDF_MIME)).toBe(false);
    expect(matchesMime(Buffer.from("%PDF-1.7"), DOCX_MIME)).toBe(false);
    expect(matchesMime(Buffer.from("%P"), PDF_MIME)).toBe(false);
  });

  it("names the download after the person, never after the stored file", () => {
    expect(resumeDownloadName("Jordan A. Reyes", PDF_MIME)).toBe("Jordan-A-Reyes-Resume.pdf");
    expect(resumeDownloadName("José Núñez", DOCX_MIME)).toBe("Jose-Nunez-Resume.docx");
    expect(resumeDownloadName("", PDF_MIME)).toBe("Resume.pdf");
  });
});
