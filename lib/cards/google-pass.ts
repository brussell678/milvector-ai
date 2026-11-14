import { createSign } from "node:crypto";
import { cardUrl } from "@/lib/cards/access";
import { readPem } from "@/lib/cards/apple-pass";
import type { CardData } from "@/lib/cards/schema";
import { siteUrl } from "@/lib/seo";

// Google Wallet "generic" pass for a business card.
//
// A visitor saves a pass by opening https://pay.google.com/gp/v/save/<jwt>,
// where the JWT is signed with a Google Cloud service account key.
//
// Google asks that the save link stay under about 1,800 characters, and a pass
// described in full inside the JWT runs past that. So the normal path is:
//   1. register the pass with the Wallet API (create or update the object),
//   2. hand out a short JWT that only names it.
// Registering it also means a pass already in someone's wallet updates when
// the card is added again after an edit. If the API call fails, the fallback
// is a trimmed pass carried inside the JWT itself.
//
// Off until the GOOGLE_WALLET_* variables are set. See docs/WALLET_SETUP.md.

export type GoogleConfig = { issuerId: string; serviceAccountEmail: string; privateKeyPem: string };

export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const serviceAccountEmail = env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKeyPem = readPem(env.GOOGLE_WALLET_PRIVATE_KEY);
  if (!issuerId || !serviceAccountEmail || !privateKeyPem) return null;
  return { issuerId, serviceAccountEmail, privateKeyPem };
}

type PassArgs = { card: CardData; slug: string; cardId: string; hasPhoto: boolean; issuerId: string };

const localized = (value: string) => ({ defaultValue: { language: "en-US", value } });
const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export const googleClassId = (issuerId: string) => `${issuerId}.milvector_business_card`;
export const googleObjectId = (issuerId: string, cardId: string) => `${issuerId}.card_${cardId.replace(/[^A-Za-z0-9]/g, "")}`;

// `full` is the pass registered through the API. The trimmed form is what fits
// inside a save link when the API cannot be reached.
export function buildGoogleObject({ card, slug, cardId, hasPhoto, issuerId }: PassArgs, full: boolean) {
  const text = [
    card.phone && { id: "phone", header: "Phone", body: card.phone },
    card.email && { id: "email", header: "Email", body: card.email },
    full && card.headline && { id: "about", header: "About", body: card.headline },
    full && card.location && { id: "location", header: "Location", body: card.location },
  ].filter(Boolean);
  const uris = [
    { id: "card", uri: cardUrl(slug), description: "Open my digital card" },
    ...(full && card.website ? [{ id: "web", uri: card.website, description: "Website" }] : []),
    ...(full ? card.links.map((link, i) => ({ id: `link${i}`, uri: link.url, description: link.label || "Link" })) : []),
  ];
  return {
    id: googleObjectId(issuerId, cardId),
    classId: googleClassId(issuerId),
    state: "ACTIVE",
    cardTitle: localized(card.company || "Business Card"),
    header: localized(card.name),
    ...(card.title ? { subheader: localized(card.title) } : {}),
    hexBackgroundColor: card.accent,
    logo: { sourceUri: { uri: hasPhoto ? `${siteUrl}/c/${slug}/photo` : `${siteUrl}/assets/milvector-ai-logo.png` } },
    barcode: { type: "QR_CODE", value: cardUrl(slug, "wallet") },
    textModulesData: text,
    linksModuleData: { uris },
  };
}

function signJwt(claims: object, privateKeyPem: string): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKeyPem);
  return `${head}.${body}.${b64url(signature)}`;
}

// The save link. `objects` is either a full description (fallback) or just
// { id, classId } for a pass already registered through the API.
export function googleSaveJwt(config: GoogleConfig, objects: object[], classes: object[] = [], now = Math.floor(Date.now() / 1000)): string {
  return signJwt(
    {
      iss: config.serviceAccountEmail,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      origins: [siteUrl],
      payload: { ...(classes.length ? { genericClasses: classes } : {}), genericObjects: objects },
    },
    config.privateKeyPem,
  );
}

const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Fetcher = typeof fetch;

async function accessToken(config: GoogleConfig, fetcher: Fetcher): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { iss: config.serviceAccountEmail, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: TOKEN_URL, iat: now, exp: now + 600 },
    config.privateKeyPem,
  );
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token request failed (${res.status})`);
  return json.access_token;
}

// Creates the pass class if needed, then creates or updates the pass.
export async function registerGooglePass(config: GoogleConfig, object: ReturnType<typeof buildGoogleObject>, fetcher: Fetcher = fetch): Promise<void> {
  const token = await accessToken(config, fetcher);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const classRes = await fetcher(`${WALLET_API}/genericClass`, { method: "POST", headers, body: JSON.stringify({ id: object.classId }) });
  // 409 means the class already exists, which is the normal case after the first pass.
  if (!classRes.ok && classRes.status !== 409) throw new Error(`Google Wallet class request failed (${classRes.status})`);

  const update = await fetcher(`${WALLET_API}/genericObject/${encodeURIComponent(object.id)}`, { method: "PUT", headers, body: JSON.stringify(object) });
  if (update.ok) return;
  if (update.status !== 404) throw new Error(`Google Wallet pass update failed (${update.status})`);
  const create = await fetcher(`${WALLET_API}/genericObject`, { method: "POST", headers, body: JSON.stringify(object) });
  if (!create.ok && create.status !== 409) throw new Error(`Google Wallet pass create failed (${create.status})`);
}

export async function googleSaveUrl(
  args: Omit<PassArgs, "issuerId"> & { config: GoogleConfig },
  fetcher: Fetcher = fetch,
): Promise<{ url: string; mode: "registered" | "embedded" }> {
  const { config, ...rest } = args;
  const passArgs = { ...rest, issuerId: config.issuerId };
  try {
    const object = buildGoogleObject(passArgs, true);
    await registerGooglePass(config, object, fetcher);
    return { url: `https://pay.google.com/gp/v/save/${googleSaveJwt(config, [{ id: object.id, classId: object.classId }])}`, mode: "registered" };
  } catch (error) {
    console.error("google wallet registration failed, using embedded pass", error);
    const object = buildGoogleObject(passArgs, false);
    return { url: `https://pay.google.com/gp/v/save/${googleSaveJwt(config, [object], [{ id: object.classId }])}`, mode: "embedded" };
  }
}
