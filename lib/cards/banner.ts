import sharp from "sharp";
import { BANNER_HEIGHT, BANNER_JPEG_MAX_CHARS, BANNER_WIDTH } from "@/lib/cards/schema";

// Every banner is re-encoded on the server, whether it was uploaded or taken
// from the LinkedIn Builder: exactly 1584 x 396, center-cropped, as a JPEG
// small enough to store. Re-encoding also drops EXIF data, which on a phone
// photo can include where it was taken.
export async function normalizeBanner(bytes: Buffer | Uint8Array): Promise<string | null> {
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    for (const quality of [84, 76, 68, 60]) {
      const out = await sharp(bytes)
        .rotate()
        .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: "cover", position: "centre" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      const base64 = out.toString("base64");
      if (base64.length <= BANNER_JPEG_MAX_CHARS) return base64;
    }
    return null;
  } catch {
    return null;
  }
}

// Google Wallet's wide "hero" image is about 3:1 (1032 x 336 recommended), so
// the 4:1 banner is center-cropped to fit rather than letterboxed.
export const WALLET_HERO = { width: 1032, height: 336 } as const;

export async function walletHeroJpeg(base64: string): Promise<Buffer> {
  return sharp(Buffer.from(base64, "base64"))
    .resize(WALLET_HERO.width, WALLET_HERO.height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
