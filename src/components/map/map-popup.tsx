"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { aionButtonSecondary } from "@/components/aion/styles";
import { useT } from "@/lib/i18n";
import { assetUrl, type Shared } from "@/lib/map/data";
import type { TreeGroup } from "@/lib/map/taxonomy";
import type { Marker } from "@/lib/map/types";
import type { MapViewer } from "@/lib/map/viewer";
import { cn } from "@/lib/utils";

export interface MapPopupProps {
  marker: Marker;
  viewer: MapViewer;
  shared: Shared;
  groups: TreeGroup[];
  name: string;
  done: boolean;
  onToggleDone: () => void;
  onClose: () => void;
}

/** Compact marker popup. Its position is updated imperatively on every viewer frame, so it follows its marker while panning/zooming. */
export function MapPopup({ marker: m, viewer, shared, groups, name, done, onToggleDone, onClose }: MapPopupProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const p = viewer.screenPos(m);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    };
    place();
    return viewer.onFrame(place);
  }, [viewer, m]);

  const sub = groups.flatMap((g) => g.subs.map((s) => ({ g, s }))).find(({ s }) => s.cids.includes(m.cid));
  const e = m.ent;
  const d = m.cls.marker_display;
  // image: the verified entity image, else the classification's own map icon, else a neutral placeholder
  const entityImg = e?.image.status === "verified" ? assetUrl(shared, e.image.asset_id) : null;
  const typeIcon = !entityImg && d.mode === "type_icon" ? assetUrl(shared, d.type_icon_asset_id) : null;
  const img = entityImg ?? typeIcon;
  const conf = e?.image.status === "verified" && e.image.confidence !== "high" ? t("Image matched by model key (medium confidence)") : undefined;

  const details: string[] = [];
  if (e?.level && e.level > 1) details.push(`${t("Level")} ${e.level}`);
  if (m.cls.kind === "monster_rank") details.push(`${t("Rank")}: ${t(m.cls.label)}`);
  if (m.cls.kind === "resource" && m.cls.resource) details.push(`${t("Resource")}: ${m.cls.resource.source_type_label}`);
  if (e?.attributes?.creature_type) details.push(`${t("Type")}: ${e.attributes.creature_type}`);
  const category = sub ? `${t(sub.g.label)} › ${t(sub.s.label)}` : t(m.cls.label);
  const leaf = sub && sub.s.cids.length > 1 ? m.cls.label : null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={name}
      data-testid="map-popup"
      className="absolute z-20 w-max max-w-[17rem] -translate-x-1/2 -translate-y-[calc(100%+20px)] border border-gold/45 bg-[image:var(--panel-gradient)] p-2.5 pr-8 text-foreground shadow-float backdrop-blur-sm"
    >
      <span aria-hidden className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b border-gold/45 bg-surface-raised" />
      <button type="button" aria-label={t("Close")} onClick={onClose} className="absolute top-1 right-1 flex size-6 items-center justify-center text-steel hover:text-foreground">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-2.5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- small static game image; aspect ratio and transparency preserved via object-contain
          <img src={img} alt={name} title={conf} width={48} height={48} className="size-12 shrink-0 rounded-md border border-steel/20 bg-icon-well object-contain p-0.5" data-testid="popup-image" />
        ) : (
          <span className="size-12 shrink-0 rounded-md border border-dashed border-steel/30 bg-surface-sunken" title={t("No verified image")} data-testid="popup-no-image" />
        )}
        <div className="min-w-0">
          <p className="font-heading text-sm leading-tight font-semibold wrap-break-word" data-testid="popup-name">{name}</p>
          <p className="mt-0.5 text-3xs text-subtle">{category}{leaf ? ` · ${leaf}` : ""}</p>
          {details.length > 0 && <p className="mt-1 text-xs text-steel">{details.join(" · ")}</p>}
          {m.cls.completable && (
            <p className={cn("mt-0.5 text-xs font-medium", done ? "text-success-text" : "text-subtle")} data-testid="popup-status">
              {done ? t("Completed") : t("Not completed")}
            </p>
          )}
        </div>
      </div>
      {m.pool ? <p className="mt-1.5 text-3xs text-warning-text">{t("One of {n} candidate positions (not all are active at once).", { n: m.pool })}</p> : null}
      {m.cls.completable && (
        <button
          type="button"
          onClick={onToggleDone}
          data-testid="popup-done"
          aria-pressed={done}
          className={cn(aionButtonSecondary, "mt-2 flex w-full items-center justify-center gap-1.5", done && "border-success/60 bg-success/15 text-success-text")}
        >
          <Check className="size-3.5" />
          {done ? t("Done — click to undo") : t("Mark as done")}
        </button>
      )}
    </div>
  );
}
