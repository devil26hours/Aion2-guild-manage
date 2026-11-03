"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

export interface LinePoint {
  /** ISO timestamp — x position is time-proportional. */
  t: string;
  v: number;
  /** Optional marker emphasis (e.g. a selected snapshot). */
  highlight?: boolean;
}

const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Single-series time line chart (inline SVG, no dependency).
 * - Thin 2px line, ≥8px markers, recessive grid, one y-axis.
 * - Hover / focus + arrow keys move a crosshair with a tooltip.
 * - Title names the series, so no legend is needed.
 */
export function LineChart({
  title,
  points,
  format = (v) => String(v),
  color = "#c9a45c",
  height = 160,
  className,
}: {
  title: string;
  points: LinePoint[];
  format?: (v: number) => string;
  color?: string;
  height?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 52, r: 14, t: 12, b: 24 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;

  const ts = points.map((p) => new Date(p.t).getTime());
  const vs = points.map((p) => p.v);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  let vMin = Math.min(...vs);
  let vMax = Math.max(...vs);
  if (vMin === vMax) {
    vMin -= 1;
    vMax += 1;
  }
  const span = vMax - vMin;
  vMin -= span * 0.12;
  vMax += span * 0.12;

  const x = (t: number) => pad.l + (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w);
  const y = (v: number) => pad.t + h - ((v - vMin) / (vMax - vMin)) * h;
  const coords = points.map((p, i) => ({ x: x(ts[i]), y: y(p.v) }));
  const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => vMin + (vMax - vMin) * (0.12 / 1.24 + f * (1 / 1.24)));

  function nearest(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left;
    let best = 0;
    coords.forEach((c, i) => {
      if (Math.abs(c.x - px) < Math.abs(coords[best].x - px)) best = i;
    });
    return best;
  }

  function onKey(e: KeyboardEvent) {
    if (!points.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = active ?? (e.key === "ArrowRight" ? -1 : points.length);
      setActive(Math.max(0, Math.min(points.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1))));
    }
    if (e.key === "Escape") setActive(null);
  }

  const a = active !== null ? coords[active] : null;
  const latest = points.at(-1);

  return (
    <figure className={cn("border border-steel/10 bg-ink/40 p-3", className)}>
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span id={titleId} className="text-[0.65rem] font-semibold tracking-[0.18em] text-gold/85 uppercase">
          {title}
        </span>
        {latest && (
          <span className="text-sm font-semibold text-foreground tabular-nums">{format(latest.v)}</span>
        )}
      </figcaption>
      <div
        ref={wrapRef}
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-arcane/40"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-desc`}
        onKeyDown={onKey}
        onPointerMove={(e: PointerEvent) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        <span id={`${titleId}-desc`} className="sr-only">
          {points.length} snapshots from {points[0] && fmtDate.format(new Date(points[0].t))} to{" "}
          {latest && fmtDate.format(new Date(latest.t))}. Latest value {latest && format(latest.v)}. Use arrow keys to
          inspect points.
        </span>
        {width > 0 && points.length > 0 && (
          <svg width={width} height={height} aria-hidden className="block overflow-visible">
            {ticks.map((tv, i) => (
              <g key={i}>
                <line x1={pad.l} x2={pad.l + w} y1={y(tv)} y2={y(tv)} stroke="rgba(147,162,187,0.12)" strokeDasharray={i === 0 ? undefined : "2 4"} />
                <text x={pad.l - 8} y={y(tv)} dy="0.32em" textAnchor="end" fontSize="10" fill="rgba(147,162,187,0.7)">
                  {format(tv)}
                </text>
              </g>
            ))}
            <text x={pad.l} y={height - 6} fontSize="10" fill="rgba(147,162,187,0.7)">
              {fmtDate.format(new Date(t0))}
            </text>
            <text x={pad.l + w} y={height - 6} fontSize="10" textAnchor="end" fill="rgba(147,162,187,0.7)">
              {fmtDate.format(new Date(t1))}
            </text>
            {a && <line x1={a.x} x2={a.x} y1={pad.t} y2={pad.t + h} stroke="rgba(207,227,255,0.35)" />}
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {coords.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={i === active || points[i].highlight ? 5 : 4}
                fill={points[i].highlight ? color : "#0b101b"}
                stroke={i === active ? "#e8f3ff" : color}
                strokeWidth={2}
              />
            ))}
          </svg>
        )}
        {a && active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full border border-gold-dim/40 bg-ink-raised px-2 py-1 text-[0.7rem] whitespace-nowrap shadow-lg"
            style={{ left: Math.min(Math.max(a.x, 60), width - 60), top: a.y - 8 }}
          >
            <span className="text-steel">{fmtDate.format(new Date(points[active].t))}</span>{" "}
            <span className="font-semibold text-foreground tabular-nums">{format(points[active].v)}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
