"use client";

import QRCode from "qrcode";
import { qrColor, textOnColor, type CardData } from "@/lib/cards/schema";

// Images drawn in the browser from the member's card: a video call background
// and a phone lock screen. Both carry a QR code that opens the card, tagged
// so the owner can see visits that came from each one.

export type GraphicInputs = {
  card: CardData;
  // The card address the QR code opens, with its source tag.
  url: string;
  // Shown under the QR code for anyone who cannot scan it.
  shortUrl: string;
  banner: ImageBitmap | null;
  photo: ImageBitmap | null;
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const INK = "#0b1220";

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws text in the largest size from `size` down to `min` that fits `maxWidth`, then cuts it with an ellipsis if it still does not. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, min: number, weight = 400) {
  let current = size;
  ctx.font = `${weight} ${current}px ${FONT}`;
  while (current > min && ctx.measureText(text).width > maxWidth) {
    current -= 2;
    ctx.font = `${weight} ${current}px ${FONT}`;
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -2) + "…";
  ctx.fillText(out, x, y);
}

/** Draws an image to fill a box, cropping from the center like CSS object-fit: cover. */
function cover(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatar(ctx: CanvasRenderingContext2D, card: CardData, photo: ImageBitmap | null, cx: number, cy: number, radius: number, ring: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + radius * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  if (photo) cover(ctx, photo, cx - radius, cy - radius, radius * 2, radius * 2);
  else {
    ctx.fillStyle = card.accent;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = textOnColor(card.accent);
    ctx.font = `800 ${Math.round(radius * 0.8)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(card.name), cx, cy + radius * 0.04);
  }
  ctx.restore();
}

async function qrCanvas(url: string, size: number, accent: string): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, url, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark: qrColor(accent), light: "#ffffff" } });
  return canvas;
}

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png"));

/**
 * 1920 x 1080 for Zoom, Teams, and Google Meet. The middle stays plain because
 * the person sits there; name on the left, QR code on the right.
 */
export async function videoBackground({ card, url, shortUrl, banner, photo }: GraphicInputs): Promise<Blob> {
  const W = 1920;
  const H = 1080;
  const { canvas, ctx } = canvasOf(W, H);

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(0, H, 0, 0, H, 1500);
  glow.addColorStop(0, `${card.accent}99`);
  glow.addColorStop(1, `${card.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (banner) {
    // 1920 x 480 is exactly the banner's 4:1 shape.
    cover(ctx, banner, 0, 0, W, 480);
    const fade = ctx.createLinearGradient(0, 300, 0, 480);
    fade.addColorStop(0, "rgba(11,18,32,0)");
    fade.addColorStop(1, "rgba(11,18,32,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 300, W, 180);
  } else {
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, card.accent);
    band.addColorStop(1, `${card.accent}00`);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 14);
  }

  // Left: photo, name, title, organization.
  const left = 96;
  let y = 600;
  if (photo) {
    avatar(ctx, card, photo, left + 80, y, 80, "#ffffff");
    y += 150;
  } else y += 40;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  fitText(ctx, card.name || "Your Name", left, y, 640, 64, 40, 800);
  ctx.fillStyle = "#cbd5e1";
  if (card.title) fitText(ctx, card.title, left, (y += 56), 640, 34, 24, 600);
  if (card.company) fitText(ctx, card.company, left, (y += 46), 640, 34, 24, 400);

  // Right: the QR code on a white tile, with the address under it.
  const tile = 340;
  const tx = W - 96 - tile;
  const ty = 540;
  rounded(ctx, tx, ty, tile, tile, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.drawImage(await qrCanvas(url, tile - 40, card.accent), tx + 20, ty + 20, tile - 40, tile - 40);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  fitText(ctx, "Scan for my card", tx + tile / 2, ty + tile + 52, tile + 80, 32, 24, 700);
  ctx.fillStyle = "#cbd5e1";
  fitText(ctx, shortUrl, tx + tile / 2, ty + tile + 92, tile + 120, 24, 16, 400);

  return toPng(canvas);
}

/**
 * 1170 x 2532 (iPhone size; other phones crop the edges). The top stays clear
 * for the clock; the card sits below it with a large QR code anyone can scan
 * without the phone being unlocked.
 */
export async function lockScreen({ card, url, shortUrl, banner, photo }: GraphicInputs): Promise<Blob> {
  const W = 1170;
  const H = 2532;
  const { canvas, ctx } = canvasOf(W, H);

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 1700);
  glow.addColorStop(0, `${card.accent}cc`);
  glow.addColorStop(1, `${card.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // The card panel.
  const px = 90;
  const pw = W - px * 2;
  const py = 1000;
  const ph = 1190;
  rounded(ctx, px, py, pw, ph, 56);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Banner across the top of the panel, at the banner's own 4:1 shape.
  const bh = Math.round(pw / 4);
  ctx.save();
  rounded(ctx, px, py, pw, bh, [56, 56, 0, 0]);
  ctx.clip();
  if (banner) cover(ctx, banner, px, py, pw, bh);
  else {
    const band = ctx.createLinearGradient(px, py, px + pw, py + bh);
    band.addColorStop(0, card.accent);
    band.addColorStop(1, INK);
    ctx.fillStyle = band;
    ctx.fillRect(px, py, pw, bh);
  }
  ctx.restore();

  avatar(ctx, card, photo, px + 140, py + bh, 92, "#ffffff");

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  const tx = px + 260;
  fitText(ctx, card.name || "Your Name", tx, py + bh + 70, pw - 300, 58, 38, 800);
  const role = [card.title, card.company].filter(Boolean).join(" · ");
  if (role) {
    ctx.fillStyle = "#526072";
    fitText(ctx, role, tx, py + bh + 120, pw - 300, 34, 24, 600);
  }

  const qr = 560;
  const qx = (W - qr) / 2;
  const qy = py + bh + 190;
  ctx.drawImage(await qrCanvas(url, qr, card.accent), qx, qy, qr, qr);
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  fitText(ctx, "Scan to save my contact", W / 2, qy + qr + 64, pw - 80, 38, 28, 700);
  ctx.fillStyle = "#526072";
  fitText(ctx, shortUrl, W / 2, qy + qr + 112, pw - 80, 28, 20, 400);

  return toPng(canvas);
}

/** Loads an image for drawing: a same-origin URL or base64 JPEG. */
export async function bitmapFrom(source: { url: string } | { base64Jpeg: string }): Promise<ImageBitmap | null> {
  try {
    const res = "url" in source ? await fetch(source.url) : await fetch(`data:image/jpeg;base64,${source.base64Jpeg}`);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}
