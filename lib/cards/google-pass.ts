import { createSign } from "node:crypto";
import { cardUrl, shortCardUrl } from "@/lib/cards/access";
import { readPem } from "@/lib/cards/apple-pass";
import { displayPhone, MAX_LINKS, telDigits, type CardData } from "@/lib/cards/schema";
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

// bannerVersion: when the card has a banner, the time it last changed. The
// pass then shows it as its wide hero image.
type PassArgs = { card: CardData; slug: string; cardId: string; hasPhoto: boolean; issuerId: string; bannerVersion?: string | null };

const localized = (value: string) => ({ defaultValue: { language: "en-US", value } });
const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export const googleClassId = (issuerId: string) => `${issuerId}.milvector_business_card`;
export const googleObjectId = (issuerId: string, cardId: string) => `${issuerId}.card_${cardId.replace(/[^A-Za-z0-9]/g, "")}`;

// The text module a pass carries when its owner chose "Show my phone number on
// the pass". The class's card template shows it as one row on the front; a
// pass without it shows no row.
export const FACE_PHONE_MODULE = "face_phone";

// What the details list shows, in order: every text module except the front-row
// phone, then every link a pass can carry (see buildGoogleObject).
export const DETAIL_TEXT_MODULES = ["about", "location"] as const;
export const DETAIL_LINKS = ["phone", "email", "card", "web", ...Array.from({ length: MAX_LINKS }, (_, i) => `link${i}`)];

/** The pass class every business card shares: one optional row on the front, for the phone. */
export function googleClass(classId: string) {
  const field = (fieldPath: string) => ({ firstValue: { fields: [{ fieldPath }] } });
  return {
    id: classId,
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [{ oneItem: { item: field(`object.textModulesData['${FACE_PHONE_MODULE}']`) } }],
      },
      // The details list under the card, spelled out so the front-row phone is
      // not repeated there (it is already a tap-to-call link). An item a pass
      // does not have is not shown.
      detailsTemplateOverride: {
        detailsItemInfos: [
          ...DETAIL_TEXT_MODULES.map((id) => ({ item: field(`object.textModulesData['${id}']`) })),
          ...DETAIL_LINKS.map((id) => ({ item: field(`object.linksModuleData.uris['${id}']`) })),
        ],
      },
    },
  };
}

// `full` is the pass registered through the API. The trimmed form is what fits
// inside a save link when the API cannot be reached. Phone and email are links
// in the details, so a tap calls or emails; the phone can also sit on the front.
export function buildGoogleObject({ card, slug, cardId, hasPhoto, issuerId, bannerVersion }: PassArgs, full: boolean) {
  const phone = card.phone ? displayPhone(card.phone) : "";
  const text = [
    card.passShowPhone && phone && { id: FACE_PHONE_MODULE, header: "Phone", body: phone },
    full && card.headline && { id: "about", header: "About", body: card.headline },
    full && card.location && { id: "location", header: "Location", body: card.location },
  ].filter(Boolean);
  const uris = [
    ...(phone ? [{ id: "phone", uri: `tel:${telDigits(card.phone)}`, description: phone }] : []),
    ...(card.email ? [{ id: "email", uri: `mailto:${card.email}`, description: card.email }] : []),
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
    // Registered passes only: the save link that carries the whole pass has to stay short.
    ...(full && bannerVersion
      ? {
          heroImage: {
            sourceUri: { uri: `${siteUrl}/c/${slug}/banner?v=wallet&t=${encodeURIComponent(bannerVersion)}` },
            contentDescription: localized(`Banner for ${card.name}`),
          },
        }
      : {}),
    // Under the code, the address people can read and type, not the full link.
    barcode: { type: "QR_CODE", value: cardUrl(slug, "wallet"), alternateText: shortCardUrl(slug) },
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

// Brings the pass class up to date (creating it the first time), then creates
// or updates the pass. Updating the class each time keeps its front-row
// template current on passes made before the template existed.
export async function registerGooglePass(config: GoogleConfig, object: ReturnType<typeof buildGoogleObject>, fetcher: Fetcher = fetch): Promise<void> {
  const token = await accessToken(config, fetcher);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const passClass = JSON.stringify(googleClass(object.classId));
  const classUpdate = await fetcher(`${WALLET_API}/genericClass/${encodeURIComponent(object.classId)}`, { method: "PUT", headers, body: passClass });
  if (!classUpdate.ok) {
    if (classUpdate.status !== 404) throw new Error(`Google Wallet class update failed (${classUpdate.status})`);
    const classCreate = await fetcher(`${WALLET_API}/genericClass`, { method: "POST", headers, body: passClass });
    // 409: another request created it first.
    if (!classCreate.ok && classCreate.status !== 409) throw new Error(`Google Wallet class create failed (${classCreate.status})`);
  }

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
    return { url: embeddedSaveUrl(config, buildGoogleObject(passArgs, false)), mode: "embedded" };
  }
}

// Google asks that a save link stay under about 1,800 characters.
export const SAVE_LINK_LIMIT = 1800;

// The fallback link carries the whole pass, so it drops extras, least useful
// first, until it fits: the phone and email links (the card has them), the
// short address under the code, the photo, the title, then the company line.
// The name and the code always stay. The class goes by name only; the next
// registered save brings its front-row template up to date.
function embeddedSaveUrl(config: GoogleConfig, object: ReturnType<typeof buildGoogleObject>): string {
  const link = (o: object) => `https://pay.google.com/gp/v/save/${googleSaveJwt(config, [o], [{ id: object.classId }])}`;
  const cardOnly = { ...object, linksModuleData: { uris: object.linksModuleData.uris.filter((u) => u.id === "card") } };
  const noAddress = { ...cardOnly, barcode: { type: object.barcode.type, value: object.barcode.value } };
  const { logo: _logo, ...noPhoto } = noAddress;
  const { subheader: _subheader, ...noTitle } = noPhoto;
  void _logo;
  void _subheader;
  const plainTitle = { ...noTitle, cardTitle: localized("Business Card") };
  let url = "";
  for (const candidate of [object, cardOnly, noAddress, noPhoto, noTitle, plainTitle]) {
    url = link(candidate);
    if (url.length < SAVE_LINK_LIMIT) return url;
  }
  return url;
}

/** For the admin's Share tab: which Google Wallet settings are missing or unreadable, by name only. Empty when all is well. */
export function googleSetupProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  for (const name of ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL"] as const) {
    if (!env[name]?.trim()) problems.push(`${name} is not set.`);
  }
  if (!env.GOOGLE_WALLET_PRIVATE_KEY?.trim()) problems.push("GOOGLE_WALLET_PRIVATE_KEY is not set.");
  else if (!readPem(env.GOOGLE_WALLET_PRIVATE_KEY)) problems.push("GOOGLE_WALLET_PRIVATE_KEY is set, but it does not read as a PEM key (it should begin with the BEGIN line).");
  return problems;
}
