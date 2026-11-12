"use client";


import { useT } from "@/lib/i18n";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronDown, Feather, Gem, ScrollText, Shield, Sparkles, Swords, X } from "lucide-react";
import { JsonViewer } from "@/components/api-lab/json-viewer";
import { useIsDeveloper } from "@/lib/auth/me-store";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { RoleBadge } from "@/components/party/role-badge";
import { formatNumber } from "@/lib/format";
import { itemDetailKey, itemDetailTarget, profileIdentity, type ItemDetailTarget } from "@/lib/roster/item-details";
import { preloadItemDetails, requestItemDetail, useItemDetail } from "@/lib/roster/item-details-store";
import { buildProfileView, enhancementOf, gradeColor, type GearItem, type ProfileView, type StatRow } from "@/lib/roster/profile-view";
import type { RosterMember } from "@/lib/roster/types";
import { cn, dataText } from "@/lib/utils";
import { ApiIcon, GradeLabel, ItemIcon } from "./api-icon";
import { DaevanionPanel } from "./daevanion-board";
import { StatRing } from "./stat-ring";
import { ItemDetailSection } from "./item-detail-body";
import { regionLabel } from "@/lib/aion2-api/endpoints";
import { RosterClassBadge } from "./roster-class-badge";

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/**
 * What the tooltip can say about item details: the per-item request target
 * (details are fetched on hover and read from the item-details cache), or a
 * short hint when no request can be made.
 */
type TooltipDetails = { target: ItemDetailTarget } | { note: string };

/** Hover must rest this long on a tile before its detail is requested, so sweeping across tiles fetches nothing. */
const HOVER_INTENT_MS = 120;

/** Viewport box of the tile a tooltip belongs to (captured when it opens). */
type Anchor = { left: number; right: number; top: number };

/** A tooltip kept open with Alt+hover. `dx`/`dy` is how far it was dragged; higher `order` is in front. */
type Pin = { key: string; anchor: Anchor; dx: number; dy: number; order: number };

/** Marks pinned tooltips (portaled to <body>) so a host dialog can treat clicks in them as inside. */
export const GEAR_PIN_ATTR = "data-gear-pin";
export const isInGearPin = (target: EventTarget | null) => target instanceof Element && target.closest(`[${GEAR_PIN_ATTR}]`) !== null;

const anchorOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top };
};

type PinControls = { z: number; dx: number; dy: number; onClose: () => void; onFront: () => void; onDrag: (dx: number, dy: number) => void };

/**
 * In-game-style item tooltip. Shows the fields of the stored API response
 * (equipmentList: name, enchantLevel, exceedLevel, grade, icon, id, slot), the
 * matching appearance skin and — fetched for this item on hover — its detail
 * (Soul Binding, stats, sub skills, stones).
 *
 * With `pin` it is a pinned tooltip: interactive (text can be selected and
 * copied), draggable by its title, closed with its X button.
 */
function GearTooltip({ item, anchor, id, details, pin }: { item: GearItem; anchor: Anchor; id: string; details: TooltipDetails; pin?: PinControls }) {
  const t = useT();
  const c = gradeColor(item.grade);
  const level = enhancementOf(item);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const target = "target" in details ? details.target : null;
  const entry = useItemDetail(target ? itemDetailKey(target) : null);
  // Height of the rendered tooltip; details make it taller than the base 260px.
  const [height, setHeight] = useState(260);
  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight);
  }, [entry, details]);
  const W = 288;
  const gap = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = anchor.right + gap + W <= vw - 8;
  const baseLeft = right ? anchor.right + gap : Math.max(8, anchor.left - gap - W);
  const baseTop = Math.max(8, Math.min(anchor.top, vh - 8 - height));
  // A dragged pin stays reachable: its title line never leaves the viewport.
  const left = pin ? Math.min(Math.max(8, baseLeft + pin.dx), vw - W - 8) : baseLeft;
  const top = pin ? Math.min(Math.max(8, baseTop + pin.dy), vh - 40) : baseTop;
  const titleDrag = pin
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, dx: pin.dx, dy: pin.dy };
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
          const d = drag.current;
          if (d) pin.onDrag(d.dx + e.clientX - d.x, d.dy + e.clientY - d.y);
        },
        onPointerUp: () => {
          drag.current = null;
        },
        onPointerCancel: () => {
          drag.current = null;
        },
      }
    : {};
  return createPortal(
    <div
      ref={ref}
      id={id}
      role={pin ? "dialog" : "tooltip"}
      aria-label={pin ? item.name : undefined}
      {...(pin ? { [GEAR_PIN_ATTR]: "" } : {})}
      data-testid={pin ? "gear-tooltip-pinned" : "gear-tooltip"}
      className={cn(
        "fixed border bg-gradient-to-b from-surface-raised to-surface p-3 text-left",
        pin ? "pointer-events-auto select-text" : "pointer-events-none",
      )}
      style={{ left, top, width: W, zIndex: pin ? pin.z : 1000, borderColor: `${c}99`, boxShadow: `var(--float-shadow), inset 0 0 24px ${c}14` }}
      onPointerDown={pin?.onFront}
    >
      {pin && (
        <button
          type="button"
          aria-label={t("Close pinned tooltip")}
          title={t("Close")}
          className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center text-subtle transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-arcane/50 focus-visible:outline-none"
          // Keep focus where it is, so a host dialog's focus trap is not disturbed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={pin.onClose}
          data-testid="gear-tooltip-close"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      <p
        className={cn("font-heading text-[1rem] leading-snug font-bold", pin && "cursor-move touch-none pr-6 select-none")}
        style={{ color: dataText(c) }}
        data-testid="gear-tooltip-title"
        {...titleDrag}
      >
        {level && `${level.label} `}
        {item.name}
      </p>
      <p className="text-xs text-steel">
        {item.grade ? <span style={{ color: dataText(c) }}>{item.grade}</span> : null} {item.slotLabel}
      </p>
      <div className="mt-2.5 flex items-start gap-3">
        <ItemIcon item={item} size={52} />
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {item.enchant !== null && (
            <>
              <dt className="text-subtle">{t("Enchant")}</dt>
              <dd className="text-right font-semibold text-brand-strong tabular-nums">+{item.enchant}</dd>
            </>
          )}
          {item.exceed !== null && (
            <>
              <dt className="text-subtle">{t("Exceed")}</dt>
              <dd className="text-right font-semibold text-foreground tabular-nums">{item.exceed}</dd>
            </>
          )}
          {item.grade && (
            <>
              <dt className="text-subtle">{t("Grade")}</dt>
              <dd className="text-right font-semibold" style={{ color: dataText(c) }}>{item.grade}</dd>
            </>
          )}
          <dt className="text-subtle">{t("Slot")}</dt>
          <dd className="text-right text-foreground/90">{item.slotLabel}</dd>
        </dl>
      </div>
      {target && <ItemDetailSection entry={entry} />}
      {item.skin && (
        <div className="mt-3 border-t border-steel/15 pt-2" data-testid="gear-tooltip-skin">
          <p className="text-4xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Skin Info")}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <ItemIcon item={item.skin} size={30} />
            <span className="min-w-0 text-xs">
              <span className="block truncate" style={{ color: dataText(gradeColor(item.skin.grade)) }}>{item.skin.name}</span>
              {item.skin.grade && <span className="text-subtle">{item.skin.grade}</span>}
            </span>
          </div>
        </div>
      )}
      {("note" in details || item.itemId !== null) && (
        <p className="mt-3 border-t border-steel/15 pt-2 text-4xs leading-snug text-subtle">
          {"note" in details && details.note}
          {item.itemId !== null && <span className={cn("block font-mono text-subtle", "note" in details && "mt-0.5")}>{t("Item ID")}{" "}{item.itemId}</span>}
        </p>
      )}
    </div>,
    document.body,
  );
}

function GearTile({ item, details, pinned, onPin }: { item: GearItem; details: TooltipDetails; pinned: boolean; onPin: (anchor: Anchor) => void }) {
  const t = useT();
  const c = gradeColor(item.grade);
  const tipId = useId();
  const liRef = useRef<HTMLLIElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [mouseOver, setMouseOver] = useState(false);
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  // Requests start only from these events (never from render). requestItemDetail
  // is a no-op while this item is loading or freshly cached, and retries errors.
  const target = "target" in details ? details.target : null;
  const load = () => {
    cancel();
    if (target) requestItemDetail(target);
  };
  const show = (el: HTMLElement) => setAnchor(anchorOf(el));
  const hide = () => {
    cancel();
    setAnchor(null);
  };
  const pinHere = (el: Element) => {
    load();
    onPin(anchorOf(el));
  };
  const pinRef = useRef(pinHere);
  useLayoutEffect(() => {
    pinRef.current = pinHere;
  });
  // Pressing Alt while the pointer is already over this tile pins it too.
  useEffect(() => {
    if (!mouseOver) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat || !liRef.current) return;
      e.preventDefault();
      pinRef.current(liRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mouseOver]);
  return (
    <li
      ref={liRef}
      className="flex cursor-pointer items-center gap-2.5 border border-steel/10 bg-surface/50 p-1.5 transition-colors outline-none hover:border-brand-muted/50 focus-visible:border-arcane/60"
      data-slot-key={item.slotKey}
      data-item-detail={target ? "" : undefined}
      tabIndex={0}
      aria-describedby={anchor && !pinned ? tipId : undefined}
      onMouseEnter={(e) => {
        setMouseOver(true);
        if (e.altKey) return pinHere(e.currentTarget);
        show(e.currentTarget);
        cancel();
        if (target) timer.current = window.setTimeout(load, HOVER_INTENT_MS);
      }}
      onMouseLeave={() => {
        setMouseOver(false);
        hide();
      }}
      onFocus={(e) => {
        show(e.currentTarget);
        load();
      }}
      onBlur={hide}
      onClick={load}
      onKeyDown={(e) => {
        if (e.key === "Escape") hide();
        else if (e.key === "Enter") load();
      }}
    >
      {/* A pinned item shows its pinned tooltip instead of a second hover tooltip. */}
      {anchor && !pinned && <GearTooltip item={item} anchor={anchor} id={tipId} details={details} />}
      <ItemIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className="block text-4xs tracking-[0.16em] text-subtle uppercase">{item.slotLabel}</span>
        <span className="block truncate text-[0.875rem] font-medium" style={{ color: dataText(c) }} title={item.name}>
          {item.name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-3xs text-subtle">
          <GradeLabel grade={item.grade} />
          {item.exceed !== null && item.exceed > 0 && <span title={t("exceedLevel")}>{t("Exceed")}{" "}{item.exceed}</span>}
        </span>
      </span>
    </li>
  );
}

/**
 * Equipment section. With `lazyDetails`, every equipped item's detail from
 * `GET /characters/equipment/item` is preloaded in the background when the
 * panel mounts (bounded, deduplicated, through the shared per-item cache in
 * item-details-store), and hovering / focusing an item that isn't loaded yet
 * fetches it at once. The request ids come from the same stored response the
 * tiles are built from (`profile` + the item's `equipmentList` entry).
 */
function EquipmentPanel({
  member,
  view,
  identity,
  lazyDetails,
}: {
  member: RosterMember;
  view: ProfileView;
  identity: { characterId: string | null; serverId: string | null };
  lazyDetails: boolean;
}) {
  const t = useT();
  const count = view.equipment.reduce((n, g) => n + g.items.length, 0);
  // The member's region is only sent when the stored response is this member's own character.
  const region = identity.characterId === member.character_id && identity.serverId === member.server_id ? member.region : undefined;

  const detailsFor = (it: GearItem): TooltipDetails => {
    if (!lazyDetails) return { note: t("Soul Binding, item stats and stones are not stored with this profile.") };
    const r = itemDetailTarget(identity, it, region);
    return r.ok ? { target: r.target } : { note: t("Item details cannot be loaded: the stored response has no {fields} for this item.", { fields: r.missing.join(", ") }) };
  };

  // Background preload: every equipped item's detail is queued as soon as this panel
  // has its data, so a tooltip is normally ready before the first hover. Only items
  // actually shown here (skins have no per-item detail). Deduplicated, bounded and
  // cached globally by item-details-store; leaving the panel drops what is still queued.
  const preloadTargets: ItemDetailTarget[] = [];
  if (lazyDetails) {
    for (const g of view.equipment) {
      for (const it of g.items) {
        const r = itemDetailTarget(identity, it, region);
        if (r.ok) preloadTargets.push(r.target);
      }
    }
  }
  const preloadKey = preloadTargets.map(itemDetailKey).join(",");
  const preloadRef = useRef(preloadTargets);
  useLayoutEffect(() => {
    preloadRef.current = preloadTargets;
  });
  useEffect(() => (preloadKey ? preloadItemDetails(preloadRef.current) : undefined), [preloadKey]);

  const description = count
    ? lazyDetails
      ? t("{n} items equipped · hover an item for its details, Alt+hover to pin", { n: count })
      : t("{n} items equipped", { n: count })
    : undefined;

  // Every tile by a stable key, so pins always render the item as currently shown
  // (a refresh that changes an item updates or drops its pin instead of keeping stale data).
  const skinNote: TooltipDetails = { note: t("Item stats, Soul Binding and other options are not included in the AION2 API response.") };
  const tiles = new Map<string, { item: GearItem; details: TooltipDetails }>();
  for (const g of view.equipment) for (const it of g.items) tiles.set(`gear:${it.slotKey}-${it.name}`, { item: it, details: detailsFor(it) });
  for (const it of view.skins) tiles.set(`skin:${it.slotKey}-${it.name}`, { item: it, details: skinNote });

  // Pinned tooltips (Alt+hover). Several can be open at once; each closes only
  // with its own X (releasing Alt or leaving the tile keeps it). The array keeps
  // its order (so portals are never moved mid-drag or mid-selection); stacking
  // comes from `order`.
  const pinIdBase = useId();
  const [pins, setPins] = useState<Pin[]>([]);
  const nextOrder = useRef(0);
  const toFront = (ps: Pin[], key: string) => {
    const p = ps.find((x) => x.key === key);
    // Orders are unique, so an already front-most pin changes nothing (no re-render).
    if (!p || p.order === Math.max(...ps.map((x) => x.order))) return ps;
    const order = ++nextOrder.current;
    return ps.map((x) => (x === p ? { ...x, order } : x));
  };
  // Alt pressed or released on its own can move focus to the browser menu on
  // Windows; once Alt has pinned something, that release is swallowed.
  const altPinned = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !e.repeat) altPinned.current = false;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || !altPinned.current) return;
      altPinned.current = false;
      e.preventDefault();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const pin = (key: string, anchor: Anchor) => {
    altPinned.current = true;
    setPins((ps) => (ps.some((p) => p.key === key) ? toFront(ps, key) : [...ps, { key, anchor, dx: 0, dy: 0, order: ++nextOrder.current }]));
  };
  const pinnedKeys = new Set(pins.map((p) => p.key));
  const tile = (key: string, it: GearItem, details: TooltipDetails) => (
    <GearTile key={key} item={it} details={details} pinned={pinnedKeys.has(key)} onPin={(anchor) => pin(key, anchor)} />
  );

  return (
    <SectionPanel title={t("Equipment")} icon={Shield} description={description}>
      {view.equipment.length === 0 ? (
        <p className="text-sm text-steel">{t("No equipment data in the API response.")}</p>
      ) : (
        <div className="space-y-4" data-testid="equipment">
          {view.equipment.map((g) => (
            <div key={g.group}>
              <h3 className="mb-1.5 text-4xs font-semibold tracking-[0.24em] text-brand uppercase">{g.group}</h3>
              <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((it) => {
                  const key = `gear:${it.slotKey}-${it.name}`;
                  return tile(key, it, tiles.get(key)!.details);
                })}
              </ul>
            </div>
          ))}
          {view.skins.length > 0 && (
            <Collapsible title={t("Appearance skins")} count={view.skins.length}>
              <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {view.skins.map((it) => tile(`skin:${it.slotKey}-${it.name}`, it, skinNote))}
              </ul>
            </Collapsible>
          )}
        </div>
      )}
      {pins.map((p, i) => {
        const current = tiles.get(p.key);
        // Stacking rank among pins: 0 = back. All pins sit below the hover tooltip (z 1000).
        const rank = pins.filter((x) => x.order < p.order).length;
        if (!current) return null;
        return (
          <GearTooltip
            key={p.key}
            item={current.item}
            details={current.details}
            anchor={p.anchor}
            id={`${pinIdBase}-pin-${i}`}
            pin={{
              z: 100 + rank,
              dx: p.dx,
              dy: p.dy,
              onClose: () => setPins((ps) => ps.filter((x) => x.key !== p.key)),
              onFront: () => setPins((ps) => toFront(ps, p.key)),
              onDrag: (dx, dy) => setPins((ps) => ps.map((x) => (x.key === p.key ? { ...x, dx, dy } : x))),
            }}
          />
        );
      })}
    </SectionPanel>
  );
}

function StatGrid({ rows, accent }: { rows: StatRow[]; accent?: boolean }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {rows.map((s) => (
        <div
          key={s.type}
          className="border border-steel/10 bg-surface/50 px-2.5 py-1.5"
          title={[s.apiName && s.apiName !== s.name ? `${t("API name")}: ${s.apiName}` : null, ...s.effects].filter(Boolean).join("\n") || undefined}
        >
          <dt className="flex items-center justify-between gap-2 text-2xs text-steel">
            <span className="truncate">{s.name}</span>
            <span className={cn("font-heading text-base font-bold tabular-nums", accent ? "text-brand-strong" : "text-foreground")}>
              {s.value ?? "—"}
            </span>
          </dt>
          {s.effects.length > 0 && (
            <dd className="mt-0.5 space-y-px text-4xs leading-snug text-success-text">
              {s.effects.map((e, i) => (
                <span key={i} className="block truncate">{e}</span>
              ))}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function Collapsible({ title, count, children, testId }: { title: string; count?: number; children: React.ReactNode; testId?: string }) {
  return (
    <details className="group border border-steel/12 bg-surface/40" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-3xs font-semibold tracking-[0.18em] text-brand uppercase outline-none select-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-arcane/40">
        <span>
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal tracking-normal text-subtle normal-case">({count})</span>}
        </span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-steel/10 p-3">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export type ProfileSection = "header" | "equipment" | "stats" | "extras" | "skills" | "raw";

/**
 * Human-readable character profile built from the stored API response.
 * Shared by the Members detail dialog and the Character History page.
 * Fields absent from the response are hidden; raw JSON is collapsed.
 * `itemDetails` makes equipment tooltips fetch each item's detail on hover.
 */
export function CharacterProfileView({
  member,
  raw,
  sections = ["header", "equipment", "stats", "extras", "skills", "raw"],
  itemDetails = false,
}: {
  member: RosterMember;
  raw: unknown;
  sections?: ProfileSection[];
  itemDetails?: boolean;
}) {
  const t = useT();
  const view = useMemo(() => buildProfileView(raw), [raw]);
  const identity = useMemo(() => profileIdentity(raw), [raw]);
  // Raw API data is a debugging aid: only DEV accounts get it (members, leaders and guests never see it).
  const isDev = useIsDeveloper();
  const has = (s: ProfileSection) => sections.includes(s);
  const activeSkills = view?.skills.filter((s) => s.category === "Active") ?? [];
  const passiveSkills = view?.skills.filter((s) => s.category === "Passive") ?? [];
  const otherSkills = view?.skills.filter((s) => s.category !== "Active" && s.category !== "Passive") ?? [];
  // Stats display mode: kept while this profile stays open; switching only changes the view (same data, no request).
  const [statsMode, setStatsMode] = useState<"picture" | "text">("picture");
  // Skills card: open by default; the header button collapses / expands it (same as before).
  const [skillsOpen, setSkillsOpen] = useState(true);
  const skillsBodyId = useId();
  const daevanionSkills = useMemo(() => (view?.skills ?? []).map((s) => ({ name: s.name, icon: s.icon, category: s.category })), [view]);

  return (
    <div className="space-y-4" data-testid="character-profile">
      {has("header") && (
        <section className="relative overflow-hidden border border-gold/40 bg-gradient-to-br from-surface-raised via-surface to-surface">
          <div aria-hidden className="pointer-events-none absolute -top-20 -left-16 size-60 rounded-full bg-arcane/15 blur-3xl" />
          <div aria-hidden className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-brand-strong/60 to-transparent" />
          <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <ApiIcon src={member.profile_image} alt={member.character_name} size={88} color="#c9a45c" />
            <div className="min-w-0 flex-1">
              <p className="text-3xs font-semibold tracking-[0.3em] text-gold-text uppercase" data-testid="profile-server">
                {member.server_name ?? "—"} · {regionLabel(member.region)}
              </p>
              <h2 className="mt-0.5 font-heading text-2xl font-bold tracking-[0.06em] text-brand-strong sm:text-3xl" data-testid="profile-name">
                {member.character_name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span data-testid="profile-class"><RosterClassBadge className={member.class_name} withIcon /></span>
                <span className="text-steel" data-testid="profile-level">{t("Level")}{" "}<span className="font-semibold text-foreground">{member.level ?? "—"}</span></span>
                {view?.race && <span className="text-steel">{view.race}{view.gender ? ` · ${view.gender}` : ""}</span>}
                <span data-testid="profile-role"><RoleBadge role={member.role} /></span>
              </div>
              {view?.title && (
                <p className="mt-1.5 flex items-center gap-2 text-xs text-steel">
                  <ScrollText className="size-3.5 text-brand" aria-hidden />
                  <span className="text-foreground/90">{view.title.name}</span>
                  <GradeLabel grade={view.title.grade} />
                </p>
              )}
            </div>
          </div>
          <dl className="relative grid grid-cols-2 gap-px border-t border-steel/10 bg-steel/10 sm:grid-cols-4">
            {[
              ["Combat Power", member.combat_power !== null ? formatNumber(member.combat_power) : "—", "profile-cp", true],
              ["Item Level", member.item_level !== null ? formatNumber(member.item_level) : "—", "profile-il", false],
              ["Server", `${member.server_name ?? "—"} (${member.server_id})`, "profile-server-id", false],
              ["Last API update", null, "profile-updated", false],
            ].map(([label, value, tid, big]) => (
              <div key={label as string} className="bg-surface-sunken px-4 py-2.5">
                <dt className="text-4xs font-semibold tracking-[0.2em] text-subtle uppercase">{t(label as string)}</dt>
                <dd className={cn("mt-0.5 tabular-nums", big ? "font-heading text-xl font-bold text-brand-strong" : "text-sm font-semibold text-foreground")} data-testid={tid as string}>
                  {value ?? <RelativeTime iso={member.api_updated_at} />}
                </dd>
              </div>
            ))}
          </dl>
          <details className="relative border-t border-steel/10 px-4 py-1.5 text-3xs text-subtle">
            <summary className="cursor-pointer select-none">{t("Admin identifiers")}</summary>
            <p className="mt-1 font-mono break-all">id {member.id}</p>
            <p className="font-mono break-all">{t("characterId")}{" "}{member.character_id}</p>
          </details>
        </section>
      )}

      {!view && (has("equipment") || has("stats")) && (
        <p className="border border-steel/12 bg-surface/50 px-3 py-6 text-center text-sm text-steel">{t("No stored API response for this character yet.")}</p>
      )}

      {view && has("equipment") && <EquipmentPanel key={member.id} member={member} view={view} identity={identity} lazyDetails={itemDetails} />}

      {view && has("stats") && (
        <SectionPanel
          title={t("Stats")}
          icon={Swords}
          description={t("stat.statList · hover a stat for its effects")}
          action={
            view.stats.primary.length + view.stats.deity.length > 0 ? (
              <div role="radiogroup" aria-label={t("Stats display")} className="flex border border-steel/20 text-3xs font-semibold tracking-[0.14em] uppercase" data-testid="stats-mode">
                {(["picture", "text"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={statsMode === m}
                    onClick={() => setStatsMode(m)}
                    data-testid={`stats-mode-${m}`}
                    className={cn(
                      "px-2.5 py-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-arcane/40",
                      statsMode === m ? "bg-brand/15 text-brand-strong" : "text-steel hover:text-foreground",
                    )}
                  >
                    {m === "picture" ? t("Picture") : t("Text")}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          {view.stats.primary.length + view.stats.deity.length + view.stats.other.length === 0 ? (
            <p className="text-sm text-steel">{t("No stat data in the API response.")}</p>
          ) : statsMode === "picture" && view.stats.primary.length + view.stats.deity.length > 0 ? (
            <StatRing primary={view.stats.primary} deity={view.stats.deity} />
          ) : (
            <div className="space-y-4" data-testid="stats">
              {view.stats.primary.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-4xs font-semibold tracking-[0.24em] text-brand uppercase">{t("Primary")}</h3>
                  <StatGrid rows={view.stats.primary} accent />
                </div>
              )}
              {view.stats.deity.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-4xs font-semibold tracking-[0.24em] text-brand uppercase">{t("Deity")}</h3>
                  <StatGrid rows={view.stats.deity} />
                </div>
              )}
              {view.stats.other.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-4xs font-semibold tracking-[0.24em] text-brand uppercase">{t("Other")}</h3>
                  <StatGrid rows={view.stats.other} />
                </div>
              )}
            </div>
          )}
        </SectionPanel>
      )}

      {/* Visual Daevanion boards (fetched live by id) wherever the profile can load per-item data. */}
      {view && has("extras") && itemDetails && view.boards.length > 0 && (
        <DaevanionPanel
          boards={view.boards}
          identity={identity}
          region={identity.characterId === member.character_id && identity.serverId === member.server_id ? member.region : undefined}
          className={member.class_name}
          skills={daevanionSkills}
        />
      )}
      {/* Profiles without live data (no per-item loading): the board list as text, a full-width card. */}
      {view && has("extras") && !itemDetails && view.boards.length > 0 && (
        <SectionPanel title={t("Daevanion")} icon={BookOpen} description={t("daevanion.boardList")}>
          <ul className="space-y-2" data-testid="boards">
            {view.boards.map((b) => (
              <li key={`${b.id}-${b.name}`} className="flex items-center gap-2.5">
                <ApiIcon src={b.icon} alt={b.name} size={28} />
                <span className="w-24 shrink-0 truncate text-sm text-foreground">{b.name}</span>
                <span aria-hidden className="h-2 flex-1 bg-steel/10">
                  <span className="block h-full bg-[image:var(--bar-gradient)]" style={{ width: `${Math.min(100, b.percent ?? 0)}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-steel tabular-nums">
                  {b.open ?? "—"}/{b.total ?? "—"} · {b.percent ?? "—"}%
                </span>
              </li>
            ))}
          </ul>
        </SectionPanel>
      )}

      {view && has("skills") && view.skills.length > 0 && (
        <SectionPanel
          title={`${t("Skills")} (${view.skills.length})`}
          icon={Sparkles}
          action={
            <button
              type="button"
              aria-expanded={skillsOpen}
              aria-controls={skillsBodyId}
              onClick={() => setSkillsOpen((o) => !o)}
              data-testid="skills-toggle"
              className="flex items-center gap-1 text-3xs font-semibold tracking-[0.14em] text-steel uppercase outline-none hover:text-brand-strong focus-visible:ring-2 focus-visible:ring-arcane/40"
            >
              {skillsOpen ? t("Collapse") : t("Expand")}
              <ChevronDown className={cn("size-3.5 transition-transform", skillsOpen && "rotate-180")} aria-hidden />
            </button>
          }
          bodyClassName={cn(!skillsOpen && "hidden")}
        >
          <div className="space-y-3" id={skillsBodyId} data-testid="skills">
            {[
              ["Active", activeSkills],
              ["Passive", passiveSkills],
              ["Stigma Skill", otherSkills],
            ].map(([label, list]) =>
              (list as typeof activeSkills).length ? (
                <div key={label as string}>
                  <h3 className="mb-1.5 text-4xs font-semibold tracking-[0.24em] text-brand uppercase">
                    <Sparkles className="mr-1 inline size-3" aria-hidden />
                    {t(label as string)}
                  </h3>
                  <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                    {(list as typeof activeSkills).map((s, i) => (
                      <li key={`${s.name}-${i}`} className={cn("flex items-center gap-2 border border-steel/10 px-1.5 py-1 text-xs", s.equipped === false && "opacity-55")}>
                        <ApiIcon src={s.icon} alt={s.name} size={26} />
                        <span className="min-w-0 flex-1 truncate text-foreground/90">{s.name}</span>
                        {s.level !== null && <span className="text-brand-strong tabular-nums">{t("Lv")}{" "}{s.level}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </SectionPanel>
      )}

      {isDev && has("raw") && raw !== undefined && (
        <Collapsible title={t("Raw API Data")} testId="raw-api-data">
          <p className="mb-2 text-3xs text-subtle">{t("The stored response, unmodified — for developers only.")}</p>
          <JsonViewer text={JSON.stringify(raw, null, 2)} className="max-h-80" />
        </Collapsible>
      )}

      {/* Companions & Titles: always the last card, full width like every other profile card. */}
      {view && has("extras") && (view.pet || view.wing || view.wingSkin || view.titles) && (
        <div data-testid="companions-titles">
          <SectionPanel title={t("Companions & Titles")} icon={Feather}>
            <ul className="space-y-2 text-sm">
              {view.pet && (
                <li className="flex items-center gap-2.5">
                  <ApiIcon src={view.pet.icon} alt={view.pet.name} size={36} />
                  <span><span className="block text-4xs tracking-[0.16em] text-subtle uppercase">{t("Pet")}</span>{view.pet.name}{view.pet.level !== null && <span className="text-steel"> {" "}{t("· Lv.")}{" "}{view.pet.level}</span>}</span>
                </li>
              )}
              {view.wing && (
                <li className="flex items-center gap-2.5">
                  <ItemIcon item={view.wing} size={36} />
                  <span className="min-w-0"><span className="block text-4xs tracking-[0.16em] text-subtle uppercase">{t("Wings")}</span>{view.wing.name} <GradeLabel grade={view.wing.grade} /></span>
                </li>
              )}
              {view.wingSkin && (
                <li className="flex items-center gap-2.5">
                  <ApiIcon src={view.wingSkin.icon} alt={view.wingSkin.name} size={36} color={gradeColor(view.wingSkin.grade)} />
                  <span className="min-w-0"><span className="block text-4xs tracking-[0.16em] text-subtle uppercase">{t("Wing appearance")}</span>{view.wingSkin.name} <GradeLabel grade={view.wingSkin.grade} /></span>
                </li>
              )}
              {view.titles && (
                <li className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center border border-brand-muted/40 text-brand"><Gem className="size-4" /></span>
                  <span><span className="block text-4xs tracking-[0.16em] text-subtle uppercase">{t("Titles collected")}</span>{view.titles.owned ?? "—"} / {view.titles.total ?? "—"}</span>
                </li>
              )}
            </ul>
          </SectionPanel>
        </div>
      )}
    </div>
  );
}
