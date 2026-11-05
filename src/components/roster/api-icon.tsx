"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { enhancementOf, gradeColor } from "@/lib/roster/profile-view";
import { cn, dataText } from "@/lib/utils";

/** Remote icon from the API response, with a lettered fallback when it fails or is absent. */
export function ApiIcon({ src, alt, size = 40, color }: { src: string | null; alt: string; size?: number; color?: string }) {
  const [ok, setOk] = useState(true);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden border bg-icon-well"
      style={{ width: size, height: size, borderColor: color ? `${color}99` : "var(--border)", boxShadow: color ? `inset 0 0 10px ${color}33` : undefined }}
    >
      {src && ok ? (
        // eslint-disable-next-line @next/next/no-img-element -- icon URL returned by the AION2 API
        <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" onError={() => setOk(false)} className="size-full object-contain" />
      ) : (
        <span aria-hidden className="text-xs font-bold text-white/70">{alt.charAt(0)}</span>
      )}
    </span>
  );
}

/** Corner badge for an item icon (`+15`, or `★3` for Exceed items). Needs a `relative` parent; renders nothing without a value. */
export function EnhancementBadge({ enchant, exceed }: { enchant: number | null; exceed?: number | null }) {
  const t = useT();
  const e = enhancementOf({ enchant, exceed });
  if (!e) return null;
  return (
    <span
      role="img"
      aria-label={e.kind === "exceed" ? `${t("Exceed")} ${e.value}` : e.label}
      data-testid="enhancement-badge"
      data-kind={e.kind}
      className={cn(
        "absolute -top-1.5 -left-1.5 border bg-surface px-1 text-4xs leading-tight font-bold whitespace-nowrap tabular-nums",
        e.kind === "exceed" ? "border-gold/80 text-gold-text" : "border-brand-muted/60 text-brand-strong",
      )}
    >
      {e.label}
    </span>
  );
}

/** An equipment icon with its enhancement badge: the shared way to draw an item from the API. */
export function ItemIcon({ item, size }: { item: { name: string; icon: string | null; grade: string | null; enchant: number | null; exceed?: number | null }; size?: number }) {
  return (
    <span className="relative shrink-0">
      <ApiIcon src={item.icon} alt={item.name} size={size} color={gradeColor(item.grade)} />
      <EnhancementBadge enchant={item.enchant} exceed={item.exceed} />
    </span>
  );
}

export function GradeLabel({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const c = gradeColor(grade);
  return (
    <span className="border px-1 text-5xs font-semibold tracking-[0.12em] uppercase" style={{ color: dataText(c), borderColor: `${c}55`, backgroundColor: `${c}14` }}>
      {grade}
    </span>
  );
}
