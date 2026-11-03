import { CLASS_META } from "@/lib/aion/classes";
import { knownClass } from "@/lib/roster/party-adapter";
import { PARTY_ROLES, ROLE_COLORS, type PartyRole } from "./types";

/**
 * Party export renderer — draws a dedicated, Discord-friendly party card on
 * a <canvas> (no DOM screenshot, no dependency) and encodes it as PNG.
 */

export interface ExportSlot {
  index: number;
  name: string | null;
  /** Class name as returned by the API. */
  className: string | null;
  level: number | null;
  role: PartyRole | null;
  cp: number | null;
  itemLevel: number | null;
}

export interface ExportData {
  partyName: string;
  guildName: string;
  server: string;
  slots: ExportSlot[];
  totalCp: number;
  averageCp: number;
  averageItemLevel: number;
  generatedAt: Date;
}

const W = 1200;
const SCALE = 2;
const PAD = 44;
const CARD_H = 92;
const GAP = 14;
const HEADER_H = 168;
const FOOTER_H = 70;
/** Two columns; rows grow with the party size (2–10 members → 1–5 rows). */
export function exportRows(slotCount: number): number {
  return Math.max(1, Math.ceil(slotCount / 2));
}

/** Output PNG dimensions in pixels for a party of `slotCount` members. */
export function exportSize(slotCount: number) {
  const rows = exportRows(slotCount);
  return { width: W * SCALE, height: (HEADER_H + rows * CARD_H + (rows - 1) * GAP + FOOTER_H + PAD) * SCALE };
}

const C = {
  bg0: "#070a11",
  bg1: "#0b101b",
  card: "#0d1320",
  gold: "#c9a45c",
  goldBright: "#e8d1a0",
  goldDim: "#8a7440",
  steel: "#93a2bb",
  text: "#e7e3d7",
  arcane: "#5fa8ff",
};

const nf = new Intl.NumberFormat("en-US");
const df = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function fontVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** Truncate with an ellipsis so text never overflows `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left") {
  const chars = [...text];
  const width = chars.reduce((w, ch) => w + ctx.measureText(ch).width + spacing, -spacing);
  let cx = align === "right" ? x - width : x;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = `${C.goldDim}99`;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  const t = 18;
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * t);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * t, cy);
    ctx.stroke();
  }
}

export async function renderPartyCanvas(data: ExportData): Promise<HTMLCanvasElement> {
  const display = fontVar("--font-cinzel", "Georgia, serif");
  const sans = fontVar("--font-geist-sans", "Segoe UI, Arial, sans-serif");
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all([
      document.fonts.load(`700 40px ${display}`),
      document.fonts.load(`600 20px ${sans}`),
      document.fonts.load(`400 15px ${sans}`),
    ]).catch(() => undefined);
    await document.fonts.ready;
  }

  const rows = exportRows(data.slots.length);
  const px = exportSize(data.slots.length);
  const H = px.height / SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available in this browser.");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  /* background */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0e1830");
  bg.addColorStop(0.45, C.bg1);
  bg.addColorStop(1, C.bg0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 520);
  glow.addColorStop(0, "rgba(95,168,255,0.16)");
  glow.addColorStop(1, "rgba(95,168,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 520);
  frame(ctx, 16, 16, W - 32, H - 32);

  /* header */
  ctx.fillStyle = C.gold;
  ctx.font = `600 13px ${display}`;
  spaced(ctx, "AION II · GUILD COMMAND", PAD, 62, 4);
  ctx.fillStyle = C.goldBright;
  ctx.font = `700 40px ${display}`;
  ctx.fillText(fit(ctx, data.partyName, 640), PAD, 110);
  ctx.fillStyle = C.steel;
  ctx.font = `400 16px ${sans}`;
  ctx.fillText(
    fit(ctx, `${data.guildName} · Server ${data.server} · ${data.slots.length}-member party · ${df.format(data.generatedAt)}`, 640),
    PAD,
    140,
  );

  // summary boxes
  const boxes: [string, string][] = [
    ["TOTAL CP", nf.format(data.totalCp)],
    ["AVERAGE CP", data.averageCp ? nf.format(data.averageCp) : "—"],
    ["AVG ITEM LV", data.averageItemLevel ? String(data.averageItemLevel) : "—"],
  ];
  const bw = 150;
  boxes.forEach(([label, value], i) => {
    const x = W - PAD - (3 - i) * bw - (2 - i) * 10;
    const y = 52;
    ctx.fillStyle = "rgba(13,19,32,0.9)";
    ctx.fillRect(x, y, bw, 82);
    ctx.strokeStyle = "rgba(147,162,187,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, 81);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y, bw, 2);
    ctx.fillStyle = C.steel;
    ctx.font = `600 11px ${sans}`;
    spaced(ctx, label, x + 14, y + 28, 1.6);
    ctx.fillStyle = i === 0 ? C.goldBright : C.text;
    ctx.font = `700 26px ${display}`;
    ctx.fillText(fit(ctx, value, bw - 28), x + 14, y + 64);
  });

  /* slots: 2 columns × `rows` rows (left column first) */
  const colW = (W - PAD * 2 - GAP) / 2;
  data.slots.forEach((s, i) => {
    const col = i < rows ? 0 : 1;
    const row = col ? i - rows : i;
    const x = PAD + col * (colW + GAP);
    const y = HEADER_H + row * (CARD_H + GAP);
    const roleColor = s.role ? ROLE_COLORS[s.role] : "#5d6b85";

    if (!s.name) {
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "rgba(147,162,187,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, CARD_H - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(147,162,187,0.75)";
      ctx.font = `700 15px ${sans}`;
      ctx.fillText(String(s.index + 1).padStart(2, "0"), x + 18, y + 52);
      ctx.font = `italic 400 17px ${sans}`;
      ctx.fillText(s.role ? `Empty slot · ${s.role} needed` : "Empty slot", x + 62, y + 52);
      return;
    }

    ctx.fillStyle = C.card;
    ctx.fillRect(x, y, colW, CARD_H);
    ctx.strokeStyle = "rgba(147,162,187,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, CARD_H - 1);
    // role band
    ctx.fillStyle = roleColor;
    ctx.fillRect(x, y, 6, CARD_H);

    // slot number
    ctx.fillStyle = C.goldBright;
    ctx.font = `700 15px ${sans}`;
    ctx.fillText(String(s.index + 1).padStart(2, "0"), x + 18, y + 38);

    // role pill
    const roleLabel = (s.role ?? "No role").toUpperCase();
    ctx.font = `700 11px ${sans}`;
    const pw = ctx.measureText(roleLabel).width + 16;
    ctx.fillStyle = `${roleColor}33`;
    ctx.fillRect(x + 18, y + 54, pw, 22);
    ctx.strokeStyle = roleColor;
    ctx.strokeRect(x + 18.5, y + 54.5, pw - 1, 21);
    ctx.fillStyle = s.role ? "#ffffff" : C.steel;
    ctx.fillText(roleLabel, x + 26, y + 69);

    // name + class — fixed column (widest pill) so names align across cards
    ctx.font = `700 11px ${sans}`;
    const pillCol = Math.max(...[...PARTY_ROLES, "No role"].map((r) => ctx.measureText(r.toUpperCase()).width + 16));
    const textX = x + 18 + pillCol + 16;
    const rightW = 150;
    const nameMax = colW - (textX - x) - rightW - 12;
    ctx.fillStyle = C.text;
    ctx.font = `600 21px ${sans}`;
    ctx.fillText(fit(ctx, s.name, nameMax), textX, y + 40);
    const cls = knownClass(s.className);
    if (s.className) {
      ctx.fillStyle = cls ? CLASS_META[cls].color : "#93a2bb";
      ctx.save();
      ctx.translate(textX + 5, y + 64);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    ctx.fillStyle = C.steel;
    ctx.font = `400 15px ${sans}`;
    ctx.fillText(fit(ctx, `${s.className ?? "—"} · Lv. ${s.level ?? "—"}`, nameMax - 16), textX + 16, y + 69);

    // stats
    ctx.textAlign = "right";
    ctx.fillStyle = C.goldBright;
    ctx.font = `700 22px ${display}`;
    ctx.fillText(s.cp !== null ? nf.format(s.cp) : "—", x + colW - 18, y + 40);
    ctx.fillStyle = C.steel;
    ctx.font = `400 14px ${sans}`;
    ctx.fillText(`CP · iLv ${s.itemLevel ?? "—"}`, x + colW - 18, y + 68);
    ctx.textAlign = "left";
  });

  /* footer: role legend + credit */
  const fy = HEADER_H + rows * CARD_H + (rows - 1) * GAP + 40;
  const counts = Object.fromEntries(PARTY_ROLES.map((r) => [r, data.slots.filter((s) => s.name && s.role === r).length]));
  let lx = PAD;
  ctx.font = `600 14px ${sans}`;
  for (const r of PARTY_ROLES) {
    ctx.fillStyle = ROLE_COLORS[r];
    ctx.fillRect(lx, fy - 11, 12, 12);
    ctx.fillStyle = C.text;
    const label = `${r} ${counts[r]}`;
    ctx.fillText(label, lx + 18, fy);
    lx += 18 + ctx.measureText(label).width + 26;
  }
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(147,162,187,0.7)";
  ctx.font = `400 13px ${sans}`;
  ctx.fillText("Generated by AION II Guild Command · data from the AION2 API", W - PAD, fy);
  ctx.textAlign = "left";

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"),
  );
}

export function exportFileName(partyName: string, date = new Date()): string {
  const slug =
    partyName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 48) || "party";
  return `aion2-party-${slug}-${date.toISOString().slice(0, 10)}.png`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
