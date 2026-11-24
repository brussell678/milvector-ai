import { createHash, createPrivateKey, X509Certificate } from "node:crypto";
import forge from "node-forge";
import { cardUrl, shortCardUrl } from "@/lib/cards/access";
import { PASS_ASSETS } from "@/lib/cards/pass-assets";
import { displayPhone, textOnColor, type CardData } from "@/lib/cards/schema";
import { zipStore } from "@/lib/cards/zip";

// Apple Wallet pass (.pkpass) for a business card.
//
// A pass is a ZIP holding pass.json, images, manifest.json (SHA-1 of every
// file), and a detached PKCS#7 signature of the manifest made with a Pass Type
// ID certificate from an Apple Developer account. Without that certificate
// nothing here can produce a pass an iPhone will accept, so the whole feature
// is off until the APPLE_PASS_* variables are set. See docs/WALLET_SETUP.md.

export type AppleConfig = {
  passTypeId: string;
  teamId: string;
  certPem: string;
  keyPem: string;
  keyPassphrase?: string;
  wwdrPem: string;
};

// Vercel variables cannot hold raw newlines comfortably, so each PEM may be
// given as plain PEM or as base64 of the PEM file.
export function readPem(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\\n/g, "\n");
  if (trimmed.includes("-----BEGIN")) return trimmed;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : null;
  } catch {
    return null;
  }
}

export function appleConfig(env: NodeJS.ProcessEnv = process.env): AppleConfig | null {
  const certPem = readPem(env.APPLE_PASS_CERT);
  const keyPem = readPem(env.APPLE_PASS_KEY);
  const wwdrPem = readPem(env.APPLE_WWDR_CERT);
  const passTypeId = env.APPLE_PASS_TYPE_ID?.trim();
  const teamId = env.APPLE_TEAM_ID?.trim();
  if (!certPem || !keyPem || !wwdrPem || !passTypeId || !teamId) return null;
  return { passTypeId, teamId, certPem, keyPem, wwdrPem, keyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE || undefined };
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

export function buildPassJson(args: { card: CardData; slug: string; cardId: string; config: Pick<AppleConfig, "passTypeId" | "teamId"> }) {
  const { card, slug, cardId, config } = args;
  const url = cardUrl(slug, "wallet");
  const foreground = textOnColor(card.accent);
  const field = (key: string, label: string, value: string) => ({ key, label, value });

  const secondary = [card.title && field("title", "TITLE", card.title), card.company && field("company", "ORGANIZATION", card.company)].filter(Boolean);
  // The front stays clean, like the Google pass: the phone only when the owner
  // chose to show it. Phone and email are always on the back, where iPhone
  // makes them tappable.
  const phone = card.phone ? displayPhone(card.phone) : "";
  const auxiliary = [card.passShowPhone && phone && field("phone", "PHONE", phone)].filter(Boolean);
  const back = [
    field("card", "Digital card", cardUrl(slug)),
    card.headline && field("headline", "About", card.headline),
    phone && field("b-phone", "Phone", phone),
    card.email && field("b-email", "Email", card.email),
    card.website && field("b-web", "Website", card.website),
    ...card.links.map((link, i) => field(`link-${i}`, link.label || "Link", link.url)),
    field("made", "Made with", "MilVector AI, free tools for transitioning service members. www.milvector.org"),
  ].filter(Boolean);

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: cardId,
    organizationName: "MilVector AI",
    description: `Business card for ${card.name}`,
    logoText: card.company || "Business Card",
    backgroundColor: rgb(card.accent),
    foregroundColor: rgb(foreground),
    labelColor: rgb(foreground),
    sharingProhibited: false,
    generic: {
      primaryFields: [field("name", card.service || "NAME", card.name)],
      secondaryFields: secondary,
      auxiliaryFields: auxiliary,
      backFields: back,
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: url, messageEncoding: "iso-8859-1", altText: shortCardUrl(slug) }],
  };
}

function signManifest(manifest: string, config: AppleConfig): Buffer {
  const certificate = forge.pki.certificateFromPem(config.certPem);
  const wwdr = forge.pki.certificateFromPem(config.wwdrPem);
  const key = config.keyPassphrase
    ? forge.pki.decryptRsaPrivateKey(config.keyPem, config.keyPassphrase)
    : forge.pki.privateKeyFromPem(config.keyPem);
  if (!key) throw new Error("The Apple pass private key could not be read. Check APPLE_PASS_KEY and its passphrase.");

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest, "utf8");
  p7.addCertificate(wwdr);
  p7.addCertificate(certificate);
  p7.addSigner({
    key,
    certificate,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export function buildApplePass(args: {
  card: CardData;
  slug: string;
  cardId: string;
  photoPngBase64?: string | null;
  config: AppleConfig;
}): Buffer {
  const files: { name: string; data: Buffer }[] = [
    { name: "pass.json", data: Buffer.from(JSON.stringify(buildPassJson(args)), "utf8") },
    ...Object.entries(PASS_ASSETS).map(([name, base64]) => ({ name, data: Buffer.from(base64, "base64") })),
  ];
  if (args.photoPngBase64) {
    const photo = Buffer.from(args.photoPngBase64, "base64");
    files.push({ name: "thumbnail.png", data: photo }, { name: "thumbnail@2x.png", data: photo });
  }

  const manifest: Record<string, string> = {};
  for (const file of files) manifest[file.name] = createHash("sha1").update(file.data).digest("hex");
  const manifestJson = JSON.stringify(manifest);

  files.push({ name: "manifest.json", data: Buffer.from(manifestJson, "utf8") });
  files.push({ name: "signature", data: signManifest(manifestJson, args.config) });
  return zipStore(files);
}

/**
 * For the admin's Share tab: which Apple Wallet settings are missing or will
 * not work, by name only, never their values. Empty when all is well.
 */
export function appleSetupProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  for (const name of ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is not set.`);
  }
  const pems: Record<string, string | null> = {};
  for (const name of ["APPLE_PASS_CERT", "APPLE_PASS_KEY", "APPLE_WWDR_CERT"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is not set.`);
    else if (!(pems[name] = readPem(env[name]))) problems.push(`${name} is set, but it does not read as a PEM file (it should begin with the BEGIN line).`);
  }
  try {
    if (pems.APPLE_PASS_CERT && pems.APPLE_PASS_KEY) {
      const cert = new X509Certificate(pems.APPLE_PASS_CERT);
      const key = env.APPLE_PASS_KEY_PASSPHRASE ? createPrivateKey({ key: pems.APPLE_PASS_KEY, passphrase: env.APPLE_PASS_KEY_PASSPHRASE }) : createPrivateKey(pems.APPLE_PASS_KEY);
      if (!cert.checkPrivateKey(key)) problems.push("APPLE_PASS_CERT and APPLE_PASS_KEY do not belong together.");
      const typeId = env.APPLE_PASS_TYPE_ID?.trim();
      if (typeId && !cert.subject.includes(`UID=${typeId}`)) problems.push(`APPLE_PASS_TYPE_ID does not match the certificate (${cert.subject.match(/UID=([^\n,]+)/)?.[1] ?? "unknown"}).`);
      if (new Date(cert.validTo) < new Date()) problems.push("The Apple pass certificate has expired; renew it through the developer account.");
    }
  } catch (error) {
    problems.push(`The Apple certificate or key could not be read: ${error instanceof Error ? error.message : String(error)}.`);
  }
  return problems;
}
