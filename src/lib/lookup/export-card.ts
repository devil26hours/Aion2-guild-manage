import { formatNumber } from "@/lib/format";
import { canvasToPngBlob, drawCover, fit, fontVar, frame, loadBitmap } from "@/lib/party/export-png";
import { buildProfileView, enhancementOf, gradeColor, type GearItem } from "@/lib/roster/profile-view";
import type { RosterMember } from "@/lib/roster/types";

/**
 * Character Lookup "Character Party Card": a purpose-drawn, shareable PNG (not a page capture) built from the
 * profile already in memory, so exporting never re-requests the character. Same canvas approach as the party
 * export: the layout is fixed whatever the screen size or theme. Remote images go through /api/aion2/icon
 * (same-origin; the image CDN sends no CORS headers) and a failed one becomes a placeholder.
 */

const W = 1200;
const H = 675;
/** PNG size in pixels (the card is drawn 1:1). */
export const CARD_SIZE = { width: W, height: H };
/** Long enough for the icon proxy's own 10s limit plus waiting behind the browser's per-host connection limit. */
const IMAGE_TIMEOUT_MS = 20_000;

const PORTRAIT = 440;
const PAD = 34;
const GRID = { x: PORTRAIT + 40, y: 88, w: W - PORTRAIT - 40 - 44, h: H - 88 - 40 };
const CELL = { minGap: 14, maxGap: 34, label: 26, maxIcon: 100 };

const C = {
  panel: "#04070f",
  bg0: "#070f22",
  bg1: "#102748",
  well: "#0a1b37",
  gold: "#e3bd68",
  goldBright: "#f6e3ad",
  steel: "#b1c5df",
  text: "#eaf3ff",
};

/** Largest icon size whose grid fits the area; more slots simply mean a denser grid. */
export function cardGrid(count: number) {
  let best = { cols: 1, rows: 1, icon: 0 };
  for (let cols = 1; cols <= Math.max(1, count); cols++) {
    const rows = Math.max(1, Math.ceil(count / cols));
    const icon = Math.min(
      CELL.maxIcon,
      Math.floor((GRID.w + CELL.minGap) / cols - CELL.minGap),
      Math.floor((GRID.h + CELL.minGap) / rows - CELL.minGap - CELL.label),
    );
    // At equal size, fewer rows: a few items sit in one row rather than a single column.
    if (icon > best.icon || (icon === best.icon && rows < best.rows)) best = { cols, rows, icon };
  }
  return best;
}

/** Same-origin URL for a remote image; null when there is no usable URL. */
function proxied(src: string | null): string | null {
  if (!src) return null;
  try {
    return `/api/aion2/icon?u=${encodeURIComponent(new URL(src).href)}`;
  } catch {
    return null;
  }
}

function setFont(ctx: CanvasRenderingContext2D, text: string, max: number, weight: number, size: number, min: number, family: string) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > max) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
}

function drawContain(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, size: number) {
  const r = Math.min(size / img.width, size / img.height);
  const w = img.width * r;
  const h = img.height * r;
  ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
}

function drawItem(ctx: CanvasRenderingContext2D, item: GearItem, img: ImageBitmap | null, x: number, y: number, size: number, heading: string, sans: string) {
  const c = gradeColor(item.grade);
  ctx.fillStyle = C.well;
  ctx.fillRect(x, y, size, size);
  const glow = ctx.createLinearGradient(0, y, 0, y + size);
  glow.addColorStop(0, `${c}08`);
  glow.addColorStop(1, `${c}38`);
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, size, size);
  if (img) {
    drawContain(ctx, img, x + 2, y + 2, size - 4);
  } else {
    ctx.fillStyle = "rgba(177,197,223,0.6)";
    ctx.font = `700 ${Math.round(size * 0.36)}px ${heading}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText([...item.name][0] ?? "?", x + size / 2, y + size / 2);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
  ctx.strokeStyle = `${c}cc`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

  // Same rule as the site's badge: the Exceed star replaces +level; drawn over the icon's top-left corner.
  const e = enhancementOf(item);
  if (e) {
    const exceed = e.kind === "exceed";
    ctx.font = `700 15px ${sans}`;
    const bw = Math.ceil(ctx.measureText(e.label).width) + 10;
    const bx = x - 5;
    const by = y - 5;
    ctx.fillStyle = C.well;
    ctx.fillRect(bx, by, bw, 21);
    ctx.strokeStyle = exceed ? C.gold : "rgba(177,197,223,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 20);
    ctx.fillStyle = exceed ? C.goldBright : C.text;
    ctx.fillText(e.label, bx + 5, by + 16);
  }

  ctx.fillStyle = C.steel;
  ctx.font = `500 14px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText(fit(ctx, item.slotLabel, size + CELL.minGap - 2), x + size / 2, y + size + 19);
  ctx.textAlign = "left";
}

function drawStat(ctx: CanvasRenderingContext2D, label: string, value: number | null, x: number, y: number, w: number, big: number, color: string, heading: string, sans: string) {
  ctx.fillStyle = C.gold;
  ctx.font = `600 13px ${sans}`;
  ctx.letterSpacing = "2px";
  ctx.fillText(label, x, y);
  ctx.letterSpacing = "0px";
  const text = value !== null ? formatNumber(value) : "—";
  ctx.fillStyle = color;
  setFont(ctx, text, w, 700, big, 22, heading);
  ctx.fillText(text, x, y + big + 6);
}

/** The card shows only name, CP, item level, portrait and equipped slots; `missingImages` counts the placeholders drawn. */
export async function renderCharacterCard(member: RosterMember, raw: unknown): Promise<{ blob: Blob; missingImages: number }> {
  const items = (buildProfileView(raw)?.equipment ?? []).flatMap((g) => g.items);

  const thai = fontVar("--font-thai", "'Segoe UI', Arial, sans-serif");
  const heading = fontVar("--font-sora", thai);
  const sans = fontVar("--font-geist-sans", thai);
  if (document.fonts) {
    // The name can be in any script: load the subsets it actually needs before drawing it.
    await Promise.all([
      document.fonts.load(`700 52px ${heading}`, member.character_name),
      document.fonts.load(`600 13px ${sans}`, "COMBAT POWER"),
      document.fonts.load(`500 14px ${sans}`, "Main Hand"),
    ]).catch(() => undefined);
    await document.fonts.ready;
  }

  const cache = new Map<string, Promise<ImageBitmap | null>>();
  const load = (src: string | null): Promise<ImageBitmap | null> => {
    const url = proxied(src);
    if (!url) return Promise.resolve(null);
    let p = cache.get(url);
    if (!p) cache.set(url, (p = loadBitmap(url, IMAGE_TIMEOUT_MS)));
    return p;
  };
  const [portrait, ...icons] = await Promise.all([load(member.profile_image), ...items.map((it) => load(it.icon))]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available in this browser.");
  ctx.imageSmoothingQuality = "high";

  /* background */
  const bg = ctx.createLinearGradient(PORTRAIT, 0, W, H);
  bg.addColorStop(0, C.bg1);
  bg.addColorStop(1, C.bg0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 560);
  glow.addColorStop(0, "rgba(92,196,255,0.14)");
  glow.addColorStop(1, "rgba(92,196,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(PORTRAIT, 0, W - PORTRAIT, H);

  /* left column: portrait fading into the panel (portraits are shot on black) */
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, PORTRAIT, H);
  if (portrait) {
    drawCover(ctx, portrait, 0, 0, PORTRAIT);
  } else {
    ctx.fillStyle = "rgba(177,197,223,0.35)";
    ctx.font = `700 170px ${heading}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText([...member.character_name][0] ?? "?", PORTRAIT / 2, PORTRAIT / 2);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
  const fade = ctx.createLinearGradient(0, 300, 0, PORTRAIT);
  fade.addColorStop(0, "rgba(4,7,15,0)");
  fade.addColorStop(1, C.panel);
  ctx.fillStyle = fade;
  ctx.fillRect(0, 300, PORTRAIT, PORTRAIT - 300);
  const rule = ctx.createLinearGradient(0, 0, 0, H);
  rule.addColorStop(0, "rgba(227,189,104,0)");
  rule.addColorStop(0.5, C.gold);
  rule.addColorStop(1, "rgba(227,189,104,0)");
  ctx.fillStyle = rule;
  ctx.fillRect(PORTRAIT, 0, 1, H);

  /* name + headline stats */
  const textW = PORTRAIT - PAD * 2;
  ctx.fillStyle = C.text;
  setFont(ctx, member.character_name, textW, 700, 52, 26, heading);
  ctx.fillText(fit(ctx, member.character_name, textW), PAD, 486);
  ctx.fillStyle = C.gold;
  ctx.fillRect(PAD, 508, 64, 2);
  drawStat(ctx, "COMBAT POWER", member.combat_power, PAD, 544, textW * 0.58, 50, C.goldBright, heading, sans);
  drawStat(ctx, "ITEM LEVEL", member.item_level, PAD + textW * 0.62, 544, textW * 0.38, 34, C.text, heading, sans);

  /* equipment: every equipped slot from the API response, in the page's order */
  ctx.fillStyle = C.gold;
  ctx.font = `600 13px ${sans}`;
  ctx.letterSpacing = "3px";
  ctx.fillText("EQUIPMENT", GRID.x, 60);
  ctx.letterSpacing = "0px";
  if (items.length === 0) {
    ctx.fillStyle = C.steel;
    ctx.font = `400 18px ${sans}`;
    ctx.fillText("No equipment data available.", GRID.x, GRID.y + 30);
  } else {
    const { cols, rows, icon } = cardGrid(items.length);
    const gapX = cols > 1 ? Math.min(CELL.maxGap, (GRID.w - cols * icon) / (cols - 1)) : 0;
    const cellH = icon + CELL.label;
    const gapY = rows > 1 ? Math.min(CELL.maxGap, (GRID.h - rows * cellH) / (rows - 1)) : 0;
    items.forEach((it, i) => {
      // Whole pixels: at 1:1 a fractional position would blur the frames and icons.
      const x = Math.round(GRID.x + (i % cols) * (icon + gapX));
      const y = Math.round(GRID.y + Math.floor(i / cols) * (cellH + gapY));
      drawItem(ctx, it, icons[i], x, y, icon, heading, sans);
    });
  }

  /* site credit, in the strip between the grid and the frame */
  ctx.fillStyle = "rgba(177,197,223,0.75)";
  ctx.font = `500 13px ${sans}`;
  ctx.textAlign = "right";
  ctx.fillText("ChumChon AION2 · justkiddinglab.com", W - 44, H - 24);
  ctx.textAlign = "left";

  frame(ctx, 12, 12, W - 24, H - 24);

  const blob = await canvasToPngBlob(canvas);
  return { blob, missingImages: [portrait, ...icons].filter((b) => !b).length };
}

/** e.g. "JKDz-aion2-character.png"; keeps non-Latin names, drops only characters a filename can't hold. */
export function cardFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim();
  return `${safe || "character"}-aion2-character.png`;
}
