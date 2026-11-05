"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { aionField } from "@/components/aion/styles";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { assetUrl, loadSearchIndex, type Shared } from "@/lib/map/data";
import { buildTree } from "@/lib/map/taxonomy";
import type { SearchGroup } from "@/lib/map/types";
import { cn } from "@/lib/utils";

interface Props {
  shared: Shared;
  mapId: string;
  mapName: (id: string) => string;
  onPick: (g: SearchGroup) => void;
  className?: string;
}

const norm = (s: string) => s.toLowerCase();

/** Entity search over the cross-map index: by name, yielded item, or object id. */
export function MapSearch({ shared, mapId, mapName, onPick, className }: Props) {
  const t = useT();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<SearchGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const dq = useDeferredValue(q);
  const tree = useMemo(() => buildTree([...shared.cls.values()]), [shared]);

  function ensure() {
    if (index || loading.current) return;
    loading.current = true;
    loadSearchIndex().then(setIndex).catch(() => setFailed(true)).finally(() => { loading.current = false; });
  }

  const results = useMemo(() => {
    const qq = norm(dq).trim();
    if (!qq || !index) return { rows: [] as SearchGroup[], total: 0 };
    const toks = qq.split(/\s+/);
    const scored: { g: SearchGroup; score: number; here: number }[] = [];
    for (const g of index) {
      const c = shared.cls.get(g.cid);
      const hay = norm(g.name);
      const extra = c?.resource ? norm(c.resource.yields.map((y) => y.name).join(" ")) : "";
      let ok = true, score = 0;
      for (const tk of toks) {
        let p = hay.indexOf(tk);
        if (p < 0) { p = extra.indexOf(tk); if (p >= 0) p += 30; }
        if (p < 0 && /^(npc:|env:)?\d+$/.test(tk)) { const id = tk.replace(/^(npc:|env:)/, ""); if (g.objectIds.some((o) => o.startsWith(id)) || g.ids.includes(tk)) p = 100; }
        if (p < 0) { ok = false; break; }
        score += p;
      }
      if (!ok) continue;
      scored.push({ g, score: score + g.name.length * 0.01 + (g.cid === "unresolved" ? 500 : 0), here: g.maps[mapId] ?? 0 });
    }
    scored.sort((a, b) => Number(b.here > 0) - Number(a.here > 0) || a.score - b.score || b.here - a.here);
    return { rows: scored.slice(0, 30).map((s) => s.g), total: scored.length };
  }, [dq, index, shared, mapId]);

  return (
    <div className={cn("relative", className)} data-testid="map-search">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); ensure(); }}
        onFocus={() => { ensure(); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Enter" && results.rows[0]) { onPick(results.rows[0]); setOpen(false); }
        }}
        placeholder={t("Search name or ID…")}
        aria-label={t("Search entities by name or ID")}
        data-testid="map-search-input"
        className={cn(aionField, "pl-8")}
        autoComplete="off"
      />
      {open && q.trim() && (
        <div role="listbox" data-testid="map-search-results" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-[min(24rem,60dvh)] overflow-y-auto border border-gold/45 bg-surface-raised shadow-float">
          {failed && <p className="p-3 text-xs text-danger-text">{t("Could not load the search index.")}</p>}
          {!failed && !index && <p className="p-3 text-xs text-subtle">{t("Loading search index…")}</p>}
          {index && results.rows.length === 0 && <p className="p-3 text-xs text-subtle">{t("No results.")}</p>}
          {index && results.rows.length > 0 && (
            <p className="border-b border-steel/10 px-3 py-1.5 text-3xs text-subtle">
              {t("{n} match", { n: results.total.toLocaleString("en-US") })}{results.total > results.rows.length ? ` ${t("(showing {n})", { n: results.rows.length })}` : ""}
            </p>
          )}
          {results.rows.map((g) => {
            const c = shared.cls.get(g.cid);
            const sub = tree.subOf.get(g.cid);
            const grp = tree.groups.find((x) => x.id === sub?.group);
            const here = g.maps[mapId] ?? 0;
            const others = Object.entries(g.maps).filter(([m]) => m !== mapId).sort((a, b) => b[1] - a[1]);
            const img = c ? assetUrl(shared, c.resource?.primary_yield_icon ? `item:${c.resource.primary_yield_icon}` : c.marker_display.type_icon_asset_id) : null;
            return (
              <button
                key={g.key}
                type="button"
                role="option"
                aria-selected={false}
                data-testid="map-search-result"
                onMouseDown={(e) => { e.preventDefault(); onPick(g); setOpen(false); }}
                className="flex w-full items-start gap-2 border-b border-steel/10 px-3 py-2 text-left hover:bg-surface-hover"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
                {img ? <img src={img} alt="" width={22} height={22} className="mt-0.5 size-[22px] shrink-0 object-contain" /> : <span className="mt-1 size-[22px] shrink-0 rounded-full" style={{ background: grp?.color ?? "#9ca3af", transform: "scale(.4)" }} />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{g.name}</span>
                  <span className="block truncate text-3xs text-subtle">{grp ? `${t(grp.label)} › ` : ""}{sub ? t(sub.label) : ""}{c && sub && sub.cids.length > 1 ? ` · ${c.label}` : ""}</span>
                  <span className="block text-3xs text-steel">
                    {here ? t("{n} on {map}", { n: here.toLocaleString("en-US"), map: mapName(mapId) }) : t("not on {map}", { map: mapName(mapId) })}
                    {others.length ? ` · ${t("also")}: ${others.slice(0, 3).map(([m, n]) => `${mapName(m)} ${n}`).join(", ")}${others.length > 3 ? ` +${others.length - 3}` : ""}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
