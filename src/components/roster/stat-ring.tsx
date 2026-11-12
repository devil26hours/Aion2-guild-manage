"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Popover } from "radix-ui";
import { useT } from "@/lib/i18n";
import type { StatRow } from "@/lib/roster/profile-view";
import { cn } from "@/lib/utils";

/**
 * "Picture" mode of the profile Stats: the 10 Divine (deity) stats on a ring and
 * the 6 base stats beside it, from the same `stat.statList` rows as the Text mode.
 *
 * Verified against live data and NCSOFT's own character page (its stat-icon map):
 *   base:  STR Might · DEX Dexterity · AGI Precision · WIS Willpower · INT Intelligence · CON Constitution
 *          → stat_{str|dex|agi|wis|int|con}.png
 *   deity: Destruction · Death · Wisdom · Destiny · Space · Time · Life · Illusion · Freedom · Justice
 *          (API `type`; `name` is e.g. "Justice [Nezekan]") → stat_lords_{type lowercased}.png
 * NCSOFT ships no ring background image, so the ring itself is drawn with SVG in the
 * app's own colours. A stat missing from the response shows "—", never a number.
 */

const ICON_BASE = "https://assets.playnccdn.com/static-aion2/characters/img/info";

/** Base stats: left column, then right column. */
export const BASE_ORDER = ["STR", "DEX", "AGI", "WIS", "INT", "CON"] as const;

const BASE_LABEL: Record<string, string> = { STR: "Might", DEX: "Dexterity", AGI: "Precision", WIS: "Willpower", INT: "Intelligence", CON: "Constitution" };

export const statIcon = (type: string, deity: boolean) => `${ICON_BASE}/stat_${deity ? `lords_${type.toLowerCase()}` : type.toLowerCase()}.png`;

/**
 * Ring geometry, in % of the square (SVG viewBox 0-100, centre 50/50). The divine stats sit
 * in two columns of 5 (left / right, as in game) inside the band between the inner circle
 * and the dashed ring: rows at the same heights on both sides, evenly spaced (`rows`), each
 * icon centred on an arc of radius `iconArc` with its value + label on the inner side. The
 * top and bottom (12 and 6 o'clock) stay empty; the spokes are drawn only there (`spokes`,
 * degrees, 0 = 3 o'clock, clockwise). Exposed as data-* for the browser test.
 */
export const RING = {
  outer: 37,
  dashed: 35.6,
  inner: 12,
  spokeFrom: 12,
  spokeTo: 20,
  spokes: [-110, -90, -70, 70, 90, 110],
  rows: [-24, -12, 0, 12, 24],
  iconArc: 30,
  icon: 7,
} as const;

/** Left column (top → bottom) and right column (top → bottom). */
export const DEITY_LEFT = ["Justice", "Freedom", "Illusion", "Life", "Time"] as const;
export const DEITY_RIGHT = ["Destruction", "Death", "Wisdom", "Destiny", "Space"] as const;

/** "Defense increase +5.1%" → name + value, exactly as the API wrote them; other text stays whole. */
export function splitEffect(text: string): { name: string; value: string | null } {
  const m = /^(.*?)\s*([+-]\d+(?:\.\d+)?%?)$/.exec(text.trim());
  return m && m[1] ? { name: m[1], value: m[2] } : { name: text.trim(), value: null };
}

const tooltip = (s: StatRow | undefined, t: (k: string) => string) =>
  s ? [s.apiName && s.apiName !== s.name ? `${t("API name")}: ${s.apiName}` : s.name, ...s.effects].filter(Boolean).join("\n") : t("Not in the API response");

function StatIcon({ src, size, className }: { src: string; size: string; className?: string }) {
  const [ok, setOk] = useState(true);
  return ok ? (
    // eslint-disable-next-line @next/next/no-img-element -- NCSOFT CDN stat icon
    <img src={src} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setOk(false)} className={cn("shrink-0 object-contain", size, className)} />
  ) : (
    <span aria-hidden className={cn("shrink-0 rounded-full border border-gold/40 bg-surface", size, className)} />
  );
}

export function StatRing({ primary, deity }: { primary: StatRow[]; deity: StatRow[] }) {
  const t = useT();
  const glowId = useId();
  const deityBy = new Map(deity.map((s) => [s.type, s]));
  const baseBy = new Map(primary.map((s) => [s.type, s]));

  const base = (type: string, side: "left" | "right") => {
    const s = baseBy.get(type);
    return (
      <li
        key={type}
        data-testid="stat-base"
        data-type={type}
        title={tooltip(s, t)}
        className={cn(
          "flex items-center gap-2.5 border border-steel/12 bg-surface/60 px-2.5 py-2",
          side === "right" && "sm:flex-row-reverse sm:text-right",
        )}
      >
        <StatIcon src={statIcon(type, false)} size="size-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-2xs tracking-wide text-steel">{s?.name ?? BASE_LABEL[type]}</span>
          <span className="block font-heading text-lg leading-tight font-bold text-brand-strong tabular-nums" data-testid="stat-value">{s?.value ?? "—"}</span>
        </span>
      </li>
    );
  };

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,34rem)_minmax(9rem,12rem)] sm:justify-center" data-testid="stat-ring-layout">
      <ul className="order-2 grid grid-cols-3 gap-2 sm:order-1 sm:grid-cols-1" aria-label={t("Base stats")}>
        {BASE_ORDER.slice(0, 3).map((ty) => base(ty, "left"))}
      </ul>

      {/* Ring: square, scales with its own width (container query units) so nothing overlaps. */}
      <div
        className="@container order-1 mx-auto aspect-square w-full max-w-[34rem] sm:order-2"
        data-testid="stat-ring"
        data-ring-outer={RING.outer}
        data-ring-dashed={RING.dashed}
        data-ring-inner={RING.inner}
        data-ring-spoke={`${RING.spokeFrom},${RING.spokeTo}`}
        data-ring-spokes={RING.spokes.join(",")}
      >
        <div className="relative size-full">
          <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full">
            <defs>
              <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--arcane)" stopOpacity="0.16" />
                <stop offset="70%" stopColor="var(--arcane)" stopOpacity="0.04" />
                <stop offset="100%" stopColor="var(--arcane)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="49" fill={`url(#${glowId})`} />
            <circle cx="50" cy="50" r="37" fill="none" stroke="var(--gold)" strokeOpacity="0.55" strokeWidth="0.5" />
            <circle cx="50" cy="50" r="35.6" fill="none" stroke="var(--gold)" strokeOpacity="0.25" strokeWidth="0.25" strokeDasharray="0.8 1.2" />
            <circle cx="50" cy="50" r={RING.inner} fill="none" stroke="var(--gold)" strokeOpacity="0.35" strokeWidth="0.35" />
            {RING.spokes.map((deg, i) => {
              const a = deg * (Math.PI / 180);
              return <line key={i} x1={50 + RING.spokeFrom * Math.cos(a)} y1={50 + RING.spokeFrom * Math.sin(a)} x2={50 + RING.spokeTo * Math.cos(a)} y2={50 + RING.spokeTo * Math.sin(a)} stroke="var(--gold)" strokeOpacity="0.2" strokeWidth="0.3" />;
            })}
          </svg>

          {/* Centre: a golden star with a warm, pulsing glow and twinkling sparkles (decoration only). */}
          <GoldenStar />

          <ul aria-label={t("Divine stats")}>
            {([["left", DEITY_LEFT], ["right", DEITY_RIGHT]] as const).flatMap(([side, column]) =>
              column.map((type, row) => {
                const y = RING.rows[row];
                // Icon centre on the arc; the row is anchored by the icon's outer edge.
                const x = Math.sqrt(RING.iconArc ** 2 - y ** 2);
                const edge = `${50 - x - RING.icon / 2}%`;
                return (
                  <DeityStat
                    key={type}
                    type={type}
                    side={side}
                    stat={deityBy.get(type)}
                    style={{ top: `${50 + y}%`, ...(side === "left" ? { left: edge } : { right: edge }) }}
                  />
                );
              }),
            )}
          </ul>
        </div>
      </div>

      <ul className="order-3 grid grid-cols-3 gap-2 sm:grid-cols-1" aria-label={t("Base stats")}>
        {BASE_ORDER.slice(3).map((ty) => base(ty, "right"))}
      </ul>
    </div>
  );
}

/**
 * One divine stat on the ring + its in-game-style tooltip (Radix Popover, portaled to <body>
 * so neither the ring nor a modal clips it; it flips/shifts at the viewport edges).
 *  - mouse: opens on hover over the icon / value / label, stays open while the pointer moves
 *    onto the tooltip (short close delay), a click pins it until a click outside / Escape;
 *  - touch: a tap toggles it, a tap outside closes it;  - keyboard: Enter / Space toggles.
 * The effects are the stat's own statSecondList lines, split into name / value only for layout.
 */
function DeityStat({ type, side, stat, style }: { type: string; side: "left" | "right"; stat: StatRow | undefined; style: CSSProperties }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const pointer = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancel();
    setOpen(true);
  };
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    cancel();
    timer.current = window.setTimeout(() => setOpen(false), 150);
  };
  return (
    <li className="absolute -translate-y-1/2" style={style} data-testid="stat-deity" data-type={type} data-side={side}>
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) pinned.current = false;
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`${type}: ${stat?.value ?? "—"}`}
            data-testid="stat-deity-trigger"
            onPointerDown={(e) => {
              pointer.current = e.pointerType;
            }}
            onPointerEnter={enter}
            onPointerLeave={leave}
            onClick={(e) => {
              e.preventDefault(); // replaces Radix's own toggle with the rules above
              if (pointer.current === "mouse") {
                pinned.current = true;
                setOpen(true);
              } else setOpen((o) => !o); // touch tap or keyboard
              pointer.current = null;
            }}
            // Icon on the ring side, value + label towards the centre.
            className={cn(
              "flex items-center gap-[0.8cqw] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-arcane/50",
              side === "left" ? "flex-row text-left" : "flex-row-reverse text-right",
            )}
          >
            <StatIcon src={statIcon(type, true)} size="size-[7cqw]" className="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]" />
            <span className={cn("flex flex-col", side === "left" ? "items-start" : "items-end")}>
              <span className="font-heading text-[clamp(11px,3.2cqw,20px)] leading-none font-bold text-foreground tabular-nums" data-testid="stat-value">
                {stat?.value ?? "—"}
              </span>
              <span className="mt-[0.3cqw] text-[clamp(8px,2cqw,12px)] leading-tight whitespace-nowrap text-steel">{type}</span>
            </span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="center"
            sideOffset={6}
            collisionPadding={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            // Focus never moves into the tooltip, so none is returned (no focus ring after a hover).
            onCloseAutoFocus={(e) => e.preventDefault()}
            onPointerEnter={enter}
            onPointerLeave={leave}
            data-testid="stat-tooltip"
            className="z-[80] w-max max-w-[min(18rem,calc(100vw-1rem))] border border-gold/45 bg-gradient-to-b from-surface-raised to-surface px-3 py-2.5 text-left shadow-[var(--float-shadow)]"
          >
            <div className="flex items-start gap-2.5">
              <StatIcon src={statIcon(type, true)} size="size-8" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-3">
                  <span className="font-heading text-sm font-bold tracking-wide text-gold-text">{type}</span>
                  <span className="font-heading text-sm font-bold text-foreground tabular-nums">{stat?.value ?? "—"}</span>
                </p>
                {stat?.apiName && stat.apiName !== type && <p className="text-3xs text-subtle">{stat.apiName}</p>}
              </div>
            </div>
            {!stat ? (
              <p className="mt-2 border-t border-steel/15 pt-2 text-3xs text-subtle">{t("Not in the API response")}</p>
            ) : stat.effects.length === 0 ? (
              <p className="mt-2 border-t border-steel/15 pt-2 text-3xs text-subtle" data-testid="stat-tooltip-none">{t("The API lists no effects for this stat.")}</p>
            ) : (
              <ul className="mt-2 space-y-1 border-t border-steel/15 pt-2 text-xs" data-testid="stat-tooltip-effects">
                {stat.effects.map((e, i) => {
                  const p = splitEffect(e);
                  return (
                    <li key={i} className="flex items-baseline justify-between gap-4" data-effect={e}>
                      <span className="text-foreground">{p.name}</span>
                      {p.value && <span className="font-semibold text-success-text tabular-nums">{p.value}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </li>
  );
}

/**
 * Decorative centre of the stat ring: a golden eight-point star in layered warm light
 * (outer amber halo, inner soft-yellow core), breathing gently, with a few gold sparkles
 * twinkling around it. Pure SVG + CSS (no images). Sized in container units, so it scales
 * with the ring and stays inside the inner circle (radius 12% of the ring). Animations are
 * the global .aion-star-* / .aion-sparkle classes, switched off under prefers-reduced-motion.
 */
const STAR_SPARKLES = [
  { x: 50, y: 6, size: 3.2, delay: "0s", dur: "3.4s" },
  { x: 88, y: 30, size: 2.4, delay: "1.3s", dur: "4.2s" },
  { x: 84, y: 76, size: 3, delay: "2.4s", dur: "3.8s" },
  { x: 46, y: 94, size: 2.2, delay: "0.7s", dur: "4.6s" },
  { x: 12, y: 72, size: 2.8, delay: "1.9s", dur: "3.6s" },
  { x: 14, y: 24, size: 2.4, delay: "3s", dur: "4.4s" },
];

function GoldenStar() {
  const id = useId();
  return (
    <div
      aria-hidden
      data-testid="stat-ring-star"
      className="pointer-events-none absolute top-1/2 left-1/2 size-[21cqw] -translate-x-1/2 -translate-y-1/2"
    >
      {/* Layered light: wide amber halo + bright soft-yellow core. */}
      <span className="aion-star-halo absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,214,120,0.55)_0%,rgba(255,180,70,0.28)_35%,rgba(255,160,50,0.08)_60%,transparent_72%)]" />
      <span className="aion-star-halo absolute inset-[22%] rounded-full bg-[radial-gradient(circle,rgba(255,246,210,0.85)_0%,rgba(255,215,120,0.45)_45%,transparent_75%)] [animation-delay:-1.8s]" />
      <svg viewBox="0 0 100 100" className="aion-star-pulse absolute inset-[14%] size-[72%] overflow-visible" data-testid="stat-ring-star-shape">
        <defs>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff6cf" />
            <stop offset="45%" stopColor="#f6cf5f" />
            <stop offset="100%" stopColor="#c08a1e" />
          </linearGradient>
          <radialGradient id={`${id}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fffdf2" />
            <stop offset="100%" stopColor="#ffe08a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Four long rays + four short diagonal rays. */}
        <path d="M50 2 L56 44 L98 50 L56 56 L50 98 L44 56 L2 50 L44 44 Z" fill={`url(#${id}-gold)`} stroke="#fff1bd" strokeWidth="0.8" strokeLinejoin="round" />
        <path d="M50 22 L54.5 45.5 L78 50 L54.5 54.5 L50 78 L45.5 54.5 L22 50 L45.5 45.5 Z" transform="rotate(45 50 50)" fill={`url(#${id}-gold)`} opacity="0.85" />
        <circle cx="50" cy="50" r="9" fill={`url(#${id}-core)`} />
      </svg>
      {STAR_SPARKLES.map((p, i) => (
        <span
          key={i}
          data-testid="stat-ring-sparkle"
          className="aion-sparkle absolute -translate-x-1/2 -translate-y-1/2"
          style={
            {
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}cqw`,
              height: `${p.size}cqw`,
              "--sparkle-delay": p.delay,
              "--sparkle-duration": p.dur,
              "--sparkle-peak": "0.9",
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
