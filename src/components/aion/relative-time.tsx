"use client";

import { useSyncExternalStore } from "react";
import { useLocale, type Locale } from "@/lib/i18n";

/**
 * "12m ago"-style timestamp. Server render and hydration show a fixed UTC
 * date (deterministic); the client then switches to a live relative time.
 */

const MINUTE = 60_000;
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, MINUTE);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  // Re-read the clock if stale by over a minute (e.g. after a long idle tab).
  const t = Date.now();
  if (t - now >= MINUTE) now = t;
  return now;
}

const absoluteFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const UNITS: Record<Locale, { now: string; m: string; h: string; d: string }> = {
  en: { now: "just now", m: "{n}m ago", h: "{n}h ago", d: "{n}d ago" },
  th: { now: "เมื่อสักครู่", m: "{n} นาทีที่แล้ว", h: "{n} ชม. ที่แล้ว", d: "{n} วันที่แล้ว" },
};

export function formatRelative(iso: string, nowMs: number, locale: Locale = "en"): string {
  const u = UNITS[locale];
  const f = (tpl: string, n: number) => tpl.replace("{n}", String(n));
  const diff = nowMs - new Date(iso).getTime();
  // Future timestamps (clock skew / bad data): show the absolute date.
  if (diff < -MINUTE) return absoluteFmt.format(new Date(iso));
  const min = Math.floor(Math.max(0, diff) / MINUTE);
  if (min < 1) return u.now;
  if (min < 60) return f(u.m, min);
  const h = Math.floor(min / 60);
  if (h < 24) return f(u.h, h);
  const d = Math.floor(h / 24);
  return d < 30 ? f(u.d, d) : absoluteFmt.format(new Date(iso));
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const locale = useLocale();
  const absolute = `${absoluteFmt.format(new Date(iso))} UTC`;
  return (
    <time dateTime={iso} title={absolute} className={className}>
      {nowMs ? formatRelative(iso, nowMs, locale) : absolute}
    </time>
  );
}
