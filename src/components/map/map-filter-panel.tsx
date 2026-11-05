"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { aionButtonSecondary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/i18n";
import { assetUrl, type Shared } from "@/lib/map/data";
import type { TreeGroup } from "@/lib/map/taxonomy";
import type { MapBundle, SearchGroup } from "@/lib/map/types";
import { cn } from "@/lib/utils";

export interface FilterPanelProps {
  shared: Shared;
  groups: TreeGroup[];
  /** Spawn locations of each classification on the current map. */
  counts: Record<string, number>;
  isOn: (cid: string) => boolean;
  setCids: (cids: string[], on: boolean) => void;
  /** Effective on/off of one monster: its own choice, else its classification's flag. */
  isEntityOn: (cid: string, entityId: string) => boolean;
  setEntities: (cid: string, entityIds: string[], on: boolean) => void;
  selectAll: () => void;
  clearAll: () => void;
  reset: () => void;
  /** Current map: source of the creature group -> creature name lists (real entity data only). */
  bundle?: MapBundle | null;
  /** Jump to a creature on the map (same action as picking a search result). */
  onPickCreature?: (g: SearchGroup) => void;
  /** Inside the mobile drawer: leave room for the drawer's close button. */
  inSheet?: boolean;
}

const sum = (cids: string[], counts: Record<string, number>) => cids.reduce((n, c) => n + (counts[c] ?? 0), 0);
const fmt = (n: number) => n.toLocaleString("en-US");

type CheckState = boolean | "indeterminate";
/** Parent state from its children: all on = checked, none on (or no children) = unchecked, otherwise indeterminate. */
const rollUp = (states: CheckState[]): CheckState => states.every((s) => s === false) ? false : states.every((s) => s === true) ? true : "indeterminate";

export function MapFilterPanel(p: FilterPanelProps) {
  const t = useT();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["exploration", "hunting", "gathering", "logistics", "events"]));
  const [openSubs, setOpenSubs] = useState<Set<string>>(() => new Set());
  // Hunting leaves: creature group (client attribute creature_type) -> individual creature names, per classification.
  const creatures = useMemo(() => {
    const o = new Map<string, Map<string, Map<string, SearchGroup>>>();
    const mapId = p.bundle?.meta.map_id ?? "";
    for (const m of p.bundle?.markers ?? []) {
      const e = m.ent;
      if (!e || e.entity_type !== "monster") continue;
      const grp = e.attributes?.creature_type ?? "";
      const byGrp = o.get(m.cid) ?? new Map<string, Map<string, SearchGroup>>();
      o.set(m.cid, byGrp);
      const names = byGrp.get(grp) ?? new Map<string, SearchGroup>();
      byGrp.set(grp, names);
      let g = names.get(e.name);
      if (!g) names.set(e.name, (g = { key: `${m.cid}|${e.name}`, name: e.name, nameKey: e.name_key, cid: m.cid, ids: [], objectIds: [], maps: { [mapId]: 0 } }));
      if (!g.ids.includes(e.entity_id)) { g.ids.push(e.entity_id); g.objectIds.push(String(e.object_id)); }
      g.maps[mapId] += 1;
    }
    return o;
  }, [p.bundle]);
  const flip = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const namesState = (cid: string, names: Iterable<SearchGroup>) => rollUp([...names].flatMap((g) => g.ids.map((id) => p.isEntityOn(cid, id))));
  /** A classification with monsters on this map rolls up from them; any other one is a plain on/off flag. */
  const cidState = (cid: string): CheckState => {
    const byGrp = creatures.get(cid);
    return byGrp ? namesState(cid, [...byGrp.values()].flatMap((names) => [...names.values()])) : p.isOn(cid);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="map-filters">
      <div className={cn("flex items-center gap-1.5 border-b border-steel/10 px-3 py-2.5", p.inSheet && "pr-10")}>
        <h2 className="mr-auto font-heading text-xs font-semibold tracking-[0.16em] text-brand-strong uppercase">{t("Marker filters")}</h2>
        <Button type="button" variant="outline" size="sm" className={cn(aionButtonSecondary, "h-7 px-2")} onClick={p.selectAll} data-testid="filter-all">{t("Select all")}</Button>
        <Button type="button" variant="outline" size="sm" className={cn(aionButtonSecondary, "h-7 px-2")} onClick={p.clearAll} data-testid="filter-clear">{t("Clear all")}</Button>
        <Button type="button" variant="outline" size="sm" className={cn(aionButtonSecondary, "h-7 px-2")} onClick={p.reset} data-testid="filter-reset">{t("Reset")}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        {p.groups.map((g) => {
          const all = g.subs.flatMap((s) => s.cids);
          const withData = all.filter((c) => (p.counts[c] ?? 0) > 0);
          const total = sum(all, p.counts);
          const state = rollUp(withData.map(cidState));
          const open = openGroups.has(g.id);
          return (
            <section key={g.id} className="border-b border-steel/10" data-testid={`group-${g.id}`}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button type="button" aria-label={open ? t("Collapse") : t("Expand")} aria-expanded={open} onClick={() => setOpenGroups((s) => flip(s, g.id))} className="flex size-6 items-center justify-center text-subtle hover:text-foreground">
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <Checkbox aria-label={g.label} checked={state} disabled={withData.length === 0} onCheckedChange={() => p.setCids(withData, state !== true)} data-testid={`group-check-${g.id}`} />
                <span className="size-2 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold tracking-wide" style={{ color: g.color }}>{t(g.label)}</span>
                <span className="text-xs text-subtle tabular-nums" title={t("Spawn locations on this map")}>{fmt(total)}</span>
              </div>
              {open && (
                <ul className="pb-1">
                  {g.subs.map((s) => {
                    const subTotal = sum(s.cids, p.counts);
                    const present = s.cids.filter((c) => (p.counts[c] ?? 0) > 0);
                    const globalSpawns = s.cids.reduce((n, c) => n + (p.shared.cls.get(c)?.spawn_count ?? 0), 0);
                    const unsupported = s.cids.length > 0 && s.cids.every((c) => p.shared.cls.get(c)?.supported === false);
                    const st = rollUp(present.map(cidState));
                    const so = openSubs.has(s.id);
                    const expandable = s.cids.length > 1 || s.cids.some((c) => creatures.has(c));
                    const note = s.cids.length === 0 || unsupported ? t("No data in client") : globalSpawns === 0 ? t("No spawns in prepared maps") : subTotal === 0 ? t("None on this map") : null;
                    return (
                      <li key={s.id}>
                        <div className={cn("flex items-center gap-2 py-1 pr-3 pl-9", subTotal === 0 && "opacity-55")} title={s.hint}>
                          {expandable ? (
                            <button type="button" aria-label={so ? t("Collapse") : t("Expand")} aria-expanded={so} onClick={() => setOpenSubs((x) => flip(x, s.id))} className="-ml-5 flex size-5 items-center justify-center text-subtle hover:text-foreground">
                              {so ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            </button>
                          ) : <span className="-ml-5 size-5" />}
                          <Checkbox aria-label={s.label} checked={st} disabled={present.length === 0} onCheckedChange={() => p.setCids(present, st !== true)} data-testid={`sub-check-${s.id}`} />
                          <span className="min-w-0 flex-1 truncate text-sm">{t(s.label)}</span>
                          {note ? <span className="text-3xs text-subtle">{note}</span> : <span className="text-xs text-steel tabular-nums" data-testid={`sub-count-${s.id}`}>{fmt(subTotal)}</span>}
                        </div>
                        {expandable && so && (
                          <ul>
                            {s.cids.map((cid) => {
                              const c = p.shared.cls.get(cid);
                              if (!c) return null;
                              const n = p.counts[cid] ?? 0;
                              const leafState = cidState(cid);
                              const icon = assetUrl(p.shared, c.resource?.primary_yield_icon ? `item:${c.resource.primary_yield_icon}` : c.marker_display.type_icon_asset_id);
                              return (
                                <li key={cid} className={cn("flex flex-wrap items-center gap-2 py-0.5 pr-3 pl-[4.25rem]", n === 0 && "opacity-45")}>
                                  <Checkbox aria-label={c.label} checked={leafState} disabled={n === 0} onCheckedChange={() => p.setCids([cid], leafState !== true)} data-testid={`leaf-check-${cid}`} />
                                  {/* eslint-disable-next-line @next/next/no-img-element -- small static game icon; next/image adds nothing */}
                                  {icon ? <img src={icon} alt="" width={18} height={18} className="size-[18px] shrink-0 object-contain" /> : <span className="size-[18px] shrink-0" />}
                                  <span className="min-w-0 flex-1 truncate text-xs">{c.label}</span>
                                  <span className="text-3xs text-subtle tabular-nums" data-testid={`leaf-count-${cid}`}>{fmt(n)}</span>
                                  {creatures.has(cid) && (
                                    <button type="button" aria-label={openSubs.has(`c:${cid}`) ? t("Collapse") : t("Expand")} aria-expanded={openSubs.has(`c:${cid}`)} onClick={() => setOpenSubs((x) => flip(x, `c:${cid}`))} className="flex size-5 items-center justify-center text-subtle hover:text-foreground" data-testid={`creatures-toggle-${cid}`}>
                                      {openSubs.has(`c:${cid}`) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                    </button>
                                  )}
                                  {creatures.has(cid) && openSubs.has(`c:${cid}`) && (
                                    <ul className="basis-full pt-0.5 pb-1 pl-6" data-testid={`creatures-${cid}`}>
                                      {[...creatures.get(cid)!.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([grp, names]) => {
                                        const gk = `g:${cid}:${grp}`;
                                        const total = [...names.values()].reduce((x, g) => x + Object.values(g.maps).reduce((y, z) => y + z, 0), 0);
                                        const grpState = namesState(cid, names.values());
                                        const grpIds = [...names.values()].flatMap((g) => g.ids);
                                        return (
                                          <li key={gk}>
                                            <div className="flex items-center gap-1.5">
                                              <Checkbox className="after:inset-x-0" aria-label={grp || t("Unspecified")} checked={grpState} onCheckedChange={() => p.setEntities(cid, grpIds, grpState !== true)} data-testid={`creature-group-check-${cid}-${grp || "none"}`} />
                                              <button type="button" aria-expanded={openSubs.has(gk)} onClick={() => setOpenSubs((x) => flip(x, gk))} className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left text-xs text-foreground hover:text-brand-strong" data-testid={`creature-group-${cid}-${grp || "none"}`}>
                                                {openSubs.has(gk) ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                                                <span className="min-w-0 flex-1 truncate">{grp || t("Unspecified")}</span>
                                                <span className="text-3xs text-subtle tabular-nums">{fmt(total)}</span>
                                              </button>
                                            </div>
                                            {openSubs.has(gk) && (
                                              <ul className="pl-5">
                                                {[...names.values()].sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
                                                  const nameState = namesState(cid, [g]);
                                                  return (
                                                    <li key={g.key} className="flex items-center gap-1.5">
                                                      <Checkbox className="after:inset-x-0" aria-label={g.name} checked={nameState} onCheckedChange={() => p.setEntities(cid, g.ids, nameState !== true)} data-testid={`creature-check-${g.ids[0]}`} />
                                                      <button type="button" onClick={() => p.onPickCreature?.(g)} className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left text-xs text-steel hover:text-brand-strong" data-testid="creature-name">
                                                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                                                        <span className="text-3xs text-subtle tabular-nums">{fmt(Object.values(g.maps).reduce((y, z) => y + z, 0))}</span>
                                                      </button>
                                                    </li>
                                                  );
                                                })}
                                              </ul>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
