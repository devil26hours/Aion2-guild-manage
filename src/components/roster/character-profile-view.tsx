"use client";


import { useT } from "@/lib/i18n";
import { useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronDown, Feather, Gem, ScrollText, Shield, Sparkles, Swords } from "lucide-react";
import { JsonViewer } from "@/components/api-lab/json-viewer";
import { RelativeTime } from "@/components/aion/relative-time";
import { SectionPanel } from "@/components/aion/section-panel";
import { RoleBadge } from "@/components/party/role-badge";
import { formatNumber } from "@/lib/format";
import { buildProfileView, gradeColor, type GearItem, type StatRow } from "@/lib/roster/profile-view";
import type { RosterMember } from "@/lib/roster/types";
import { cn } from "@/lib/utils";
import { RosterClassBadge } from "./roster-class-badge";

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** Remote icon from the API response, with a lettered fallback when it fails or is absent. */
function ApiIcon({ src, alt, size = 40, color }: { src: string | null; alt: string; size?: number; color?: string }) {
  const [ok, setOk] = useState(true);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden border bg-[#0a0e18]"
      style={{ width: size, height: size, borderColor: color ? `${color}99` : "rgba(147,162,187,0.25)", boxShadow: color ? `inset 0 0 10px ${color}33` : undefined }}
    >
      {src && ok ? (
        // eslint-disable-next-line @next/next/no-img-element -- icon URL returned by the AION2 API
        <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" onError={() => setOk(false)} className="size-full object-contain" />
      ) : (
        <span aria-hidden className="text-xs font-bold text-steel/60">{alt.charAt(0)}</span>
      )}
    </span>
  );
}

function GradeLabel({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const c = gradeColor(grade);
  return (
    <span className="border px-1 text-[0.55rem] font-semibold tracking-[0.12em] uppercase" style={{ color: c, borderColor: `${c}55`, backgroundColor: `${c}14` }}>
      {grade}
    </span>
  );
}

/**
 * In-game-style item tooltip. Shows ONLY fields present in the API response
 * (equipmentList: name, enchantLevel, exceedLevel, grade, icon, id, slot) plus
 * the matching appearance skin. The API does not return item stats, Soul
 * Binding or other options, so those sections are not rendered.
 */
function GearTooltip({ item, rect, id }: { item: GearItem; rect: DOMRect; id: string }) {
  const t = useT();
  const c = gradeColor(item.grade);
  const W = 288;
  const gap = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = rect.right + gap + W <= vw - 8;
  const left = right ? rect.right + gap : Math.max(8, rect.left - gap - W);
  const top = Math.min(Math.max(8, rect.top), vh - 8 - 260);
  return createPortal(
    <div
      id={id}
      role="tooltip"
      data-testid="gear-tooltip"
      className="pointer-events-none fixed z-[100] border bg-gradient-to-b from-[#121a2c] to-[#080b13] p-3 text-left shadow-[0_18px_50px_-12px_rgba(0,0,0,0.95)]"
      style={{ left, top, width: W, borderColor: `${c}99`, boxShadow: `0 18px 50px -12px rgba(0,0,0,0.95), inset 0 0 24px ${c}14` }}
    >
      <p className="font-heading text-[0.95rem] leading-snug font-bold" style={{ color: c }} data-testid="gear-tooltip-title">
        {item.enchant !== null && item.enchant > 0 && `+${item.enchant} `}
        {item.name}
      </p>
      <p className="text-xs text-steel">
        {item.grade ? <span style={{ color: c }}>{item.grade}</span> : null} {item.slotLabel}
      </p>
      <div className="mt-2.5 flex items-start gap-3">
        <ApiIcon src={item.icon} alt={item.name} size={52} color={c} />
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {item.enchant !== null && (
            <>
              <dt className="text-steel/70">{t("Enchant")}</dt>
              <dd className="text-right font-semibold text-gold-bright tabular-nums">+{item.enchant}</dd>
            </>
          )}
          {item.exceed !== null && (
            <>
              <dt className="text-steel/70">{t("Exceed")}</dt>
              <dd className="text-right font-semibold text-foreground tabular-nums">{item.exceed}</dd>
            </>
          )}
          {item.grade && (
            <>
              <dt className="text-steel/70">{t("Grade")}</dt>
              <dd className="text-right font-semibold" style={{ color: c }}>{item.grade}</dd>
            </>
          )}
          <dt className="text-steel/70">{t("Slot")}</dt>
          <dd className="text-right text-foreground/90">{item.slotLabel}</dd>
        </dl>
      </div>
      {item.skin && (
        <div className="mt-3 border-t border-steel/15 pt-2" data-testid="gear-tooltip-skin">
          <p className="text-[0.6rem] font-semibold tracking-[0.18em] text-gold/80 uppercase">{t("Skin Info")}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <ApiIcon src={item.skin.icon} alt={item.skin.name} size={30} color={gradeColor(item.skin.grade)} />
            <span className="min-w-0 text-xs">
              <span className="block truncate" style={{ color: gradeColor(item.skin.grade) }}>{item.skin.name}</span>
              {item.skin.grade && <span className="text-steel/70">{item.skin.grade}</span>}
            </span>
          </div>
        </div>
      )}
      <p className="mt-3 border-t border-steel/15 pt-2 text-[0.62rem] leading-snug text-steel/55">
        {t("Item stats, Soul Binding and other options are not included in the AION2 API response.")}{item.itemId !== null && <span className="mt-0.5 block font-mono text-steel/45">{t("Item ID")}{" "}{item.itemId}</span>}
      </p>
    </div>,
    document.body,
  );
}

function GearTile({ item }: { item: GearItem }) {
  const t = useT();
  const c = gradeColor(item.grade);
  const tipId = useId();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const show = (el: HTMLElement) => setRect(el.getBoundingClientRect());
  const hide = () => setRect(null);
  return (
    <li
      className="flex cursor-default items-center gap-2.5 border border-steel/10 bg-ink/50 p-1.5 transition-colors outline-none hover:border-gold-dim/50 focus-visible:border-arcane/60"
      data-slot-key={item.slotKey}
      tabIndex={0}
      aria-describedby={rect ? tipId : undefined}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
      onKeyDown={(e) => e.key === "Escape" && hide()}
    >
      {rect && <GearTooltip item={item} rect={rect} id={tipId} />}
      <span className="relative">
        <ApiIcon src={item.icon} alt={item.name} color={c} />
        {item.enchant !== null && item.enchant > 0 && (
          <span className="absolute -top-1.5 -left-1.5 border border-gold-dim/60 bg-ink px-1 text-[0.6rem] leading-tight font-bold text-gold-bright tabular-nums">
            +{item.enchant}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6rem] tracking-[0.16em] text-steel/55 uppercase">{item.slotLabel}</span>
        <span className="block truncate text-[0.8rem] font-medium" style={{ color: c }} title={item.name}>
          {item.name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.65rem] text-steel/70">
          <GradeLabel grade={item.grade} />
          {item.exceed !== null && item.exceed > 0 && <span title={t("exceedLevel")}>{t("Exceed")}{" "}{item.exceed}</span>}
        </span>
      </span>
    </li>
  );
}

function StatGrid({ rows, accent }: { rows: StatRow[]; accent?: boolean }) {
  const t = useT();
  return (
    <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {rows.map((s) => (
        <div
          key={s.type}
          className="border border-steel/10 bg-ink/50 px-2.5 py-1.5"
          title={[s.apiName && s.apiName !== s.name ? `${t("API name")}: ${s.apiName}` : null, ...s.effects].filter(Boolean).join("\n") || undefined}
        >
          <dt className="flex items-center justify-between gap-2 text-[0.7rem] text-steel">
            <span className="truncate">{s.name}</span>
            <span className={cn("font-heading text-base font-bold tabular-nums", accent ? "text-gold-bright" : "text-foreground")}>
              {s.value ?? "—"}
            </span>
          </dt>
          {s.effects.length > 0 && (
            <dd className="mt-0.5 space-y-px text-[0.62rem] leading-snug text-[#9af0b3]/80">
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
    <details className="group border border-steel/12 bg-ink/40" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[0.65rem] font-semibold tracking-[0.18em] text-gold/85 uppercase outline-none select-none hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-arcane/40">
        <span>
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal tracking-normal text-steel/60 normal-case">({count})</span>}
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
 */
export function CharacterProfileView({
  member,
  raw,
  sections = ["header", "equipment", "stats", "extras", "skills", "raw"],
}: {
  member: RosterMember;
  raw: unknown;
  sections?: ProfileSection[];
}) {
  const t = useT();
  const view = useMemo(() => buildProfileView(raw), [raw]);
  const has = (s: ProfileSection) => sections.includes(s);
  const activeSkills = view?.skills.filter((s) => s.category === "Active") ?? [];
  const passiveSkills = view?.skills.filter((s) => s.category === "Passive") ?? [];
  const otherSkills = view?.skills.filter((s) => s.category !== "Active" && s.category !== "Passive") ?? [];

  return (
    <div className="space-y-4" data-testid="character-profile">
      {has("header") && (
        <section className="relative overflow-hidden border border-gold-dim/35 bg-gradient-to-br from-ink-raised via-ink to-ink">
          <div aria-hidden className="pointer-events-none absolute -top-20 -left-16 size-60 rounded-full bg-arcane/15 blur-3xl" />
          <div aria-hidden className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-gold-bright/60 to-transparent" />
          <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <ApiIcon src={member.profile_image} alt={member.character_name} size={88} color="#c9a45c" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-semibold tracking-[0.3em] text-arcane/90 uppercase" data-testid="profile-server">
                {member.server_name ?? "—"} · {member.region.toUpperCase()}
              </p>
              <h2 className="mt-0.5 font-heading text-2xl font-bold tracking-[0.06em] text-gold-bright sm:text-3xl" data-testid="profile-name">
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
                  <ScrollText className="size-3.5 text-gold/80" aria-hidden />
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
              <div key={label as string} className="bg-[#090d16] px-4 py-2.5">
                <dt className="text-[0.6rem] font-semibold tracking-[0.2em] text-steel/70 uppercase">{t(label as string)}</dt>
                <dd className={cn("mt-0.5 tabular-nums", big ? "font-heading text-xl font-bold text-gold-bright" : "text-sm font-semibold text-foreground")} data-testid={tid as string}>
                  {value ?? <RelativeTime iso={member.api_updated_at} />}
                </dd>
              </div>
            ))}
          </dl>
          <details className="relative border-t border-steel/10 px-4 py-1.5 text-[0.65rem] text-steel/60">
            <summary className="cursor-pointer select-none">{t("Admin identifiers")}</summary>
            <p className="mt-1 font-mono break-all">id {member.id}</p>
            <p className="font-mono break-all">{t("characterId")}{" "}{member.character_id}</p>
          </details>
        </section>
      )}

      {!view && (has("equipment") || has("stats")) && (
        <p className="border border-steel/12 bg-ink/50 px-3 py-6 text-center text-sm text-steel">{t("No stored API response for this character yet.")}</p>
      )}

      {view && has("equipment") && (
        <SectionPanel title={t("Equipment")} icon={Shield} description={view.equipment.length ? `${view.equipment.reduce((n, g) => n + g.items.length, 0)} items equipped` : undefined}>
          {view.equipment.length === 0 ? (
            <p className="text-sm text-steel">{t("No equipment data in the API response.")}</p>
          ) : (
            <div className="space-y-4" data-testid="equipment">
              {view.equipment.map((g) => (
                <div key={g.group}>
                  <h3 className="mb-1.5 text-[0.6rem] font-semibold tracking-[0.24em] text-gold/60 uppercase">{g.group}</h3>
                  <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((it) => <GearTile key={`${it.slotKey}-${it.name}`} item={it} />)}
                  </ul>
                </div>
              ))}
              {view.skins.length > 0 && (
                <Collapsible title={t("Appearance skins")} count={view.skins.length}>
                  <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {view.skins.map((it) => <GearTile key={`${it.slotKey}-${it.name}`} item={it} />)}
                  </ul>
                </Collapsible>
              )}
            </div>
          )}
        </SectionPanel>
      )}

      {view && has("stats") && (
        <SectionPanel title={t("Stats")} icon={Swords} description={t("stat.statList · hover a stat for its effects")}>
          {view.stats.primary.length + view.stats.deity.length + view.stats.other.length === 0 ? (
            <p className="text-sm text-steel">{t("No stat data in the API response.")}</p>
          ) : (
            <div className="space-y-4" data-testid="stats">
              {view.stats.primary.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[0.6rem] font-semibold tracking-[0.24em] text-gold/60 uppercase">{t("Primary")}</h3>
                  <StatGrid rows={view.stats.primary} accent />
                </div>
              )}
              {view.stats.deity.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[0.6rem] font-semibold tracking-[0.24em] text-gold/60 uppercase">{t("Deity")}</h3>
                  <StatGrid rows={view.stats.deity} />
                </div>
              )}
              {view.stats.other.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[0.6rem] font-semibold tracking-[0.24em] text-gold/60 uppercase">{t("Other")}</h3>
                  <StatGrid rows={view.stats.other} />
                </div>
              )}
            </div>
          )}
        </SectionPanel>
      )}

      {view && has("extras") && (view.boards.length > 0 || view.pet || view.wing || view.titles) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {view.boards.length > 0 && (
            <SectionPanel title={t("Daevanion")} icon={BookOpen} description={t("daevanion.boardList")}>
              <ul className="space-y-2" data-testid="boards">
                {view.boards.map((b) => (
                  <li key={`${b.id}-${b.name}`} className="flex items-center gap-2.5">
                    <ApiIcon src={b.icon} alt={b.name} size={28} />
                    <span className="w-24 shrink-0 truncate text-sm text-foreground">{b.name}</span>
                    <span aria-hidden className="h-2 flex-1 bg-steel/10">
                      <span className="block h-full bg-gradient-to-r from-arcane/60 to-arcane" style={{ width: `${Math.min(100, b.percent ?? 0)}%` }} />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs text-steel tabular-nums">
                      {b.open ?? "—"}/{b.total ?? "—"} · {b.percent ?? "—"}%
                    </span>
                  </li>
                ))}
              </ul>
            </SectionPanel>
          )}
          {(view.pet || view.wing || view.wingSkin || view.titles) && (
            <SectionPanel title={t("Companions & Titles")} icon={Feather}>
              <ul className="space-y-2 text-sm">
                {view.pet && (
                  <li className="flex items-center gap-2.5">
                    <ApiIcon src={view.pet.icon} alt={view.pet.name} size={36} />
                    <span><span className="block text-[0.6rem] tracking-[0.16em] text-steel/55 uppercase">{t("Pet")}</span>{view.pet.name}{view.pet.level !== null && <span className="text-steel"> {" "}{t("· Lv.")}{" "}{view.pet.level}</span>}</span>
                  </li>
                )}
                {view.wing && (
                  <li className="flex items-center gap-2.5">
                    <ApiIcon src={view.wing.icon} alt={view.wing.name} size={36} color={gradeColor(view.wing.grade)} />
                    <span className="min-w-0"><span className="block text-[0.6rem] tracking-[0.16em] text-steel/55 uppercase">{t("Wings")}</span>{view.wing.name} {view.wing.enchant ? <span className="text-gold-bright">+{view.wing.enchant}</span> : null} <GradeLabel grade={view.wing.grade} /></span>
                  </li>
                )}
                {view.wingSkin && (
                  <li className="flex items-center gap-2.5">
                    <ApiIcon src={view.wingSkin.icon} alt={view.wingSkin.name} size={36} color={gradeColor(view.wingSkin.grade)} />
                    <span className="min-w-0"><span className="block text-[0.6rem] tracking-[0.16em] text-steel/55 uppercase">{t("Wing appearance")}</span>{view.wingSkin.name} <GradeLabel grade={view.wingSkin.grade} /></span>
                  </li>
                )}
                {view.titles && (
                  <li className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center border border-gold-dim/40 text-gold"><Gem className="size-4" /></span>
                    <span><span className="block text-[0.6rem] tracking-[0.16em] text-steel/55 uppercase">{t("Titles collected")}</span>{view.titles.owned ?? "—"} / {view.titles.total ?? "—"}</span>
                  </li>
                )}
              </ul>
            </SectionPanel>
          )}
        </div>
      )}

      {view && has("skills") && view.skills.length > 0 && (
        <Collapsible title={t("Skills")} count={view.skills.length} testId="skills">
          <div className="space-y-3">
            {[
              ["Active", activeSkills],
              ["Passive", passiveSkills],
              ["Other", otherSkills],
            ].map(([label, list]) =>
              (list as typeof activeSkills).length ? (
                <div key={label as string}>
                  <h3 className="mb-1.5 text-[0.6rem] font-semibold tracking-[0.24em] text-gold/60 uppercase">
                    <Sparkles className="mr-1 inline size-3" aria-hidden />
                    {label as string}
                  </h3>
                  <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                    {(list as typeof activeSkills).map((s, i) => (
                      <li key={`${s.name}-${i}`} className={cn("flex items-center gap-2 border border-steel/10 px-1.5 py-1 text-xs", s.equipped === false && "opacity-55")}>
                        <ApiIcon src={s.icon} alt={s.name} size={26} />
                        <span className="min-w-0 flex-1 truncate text-foreground/90">{s.name}</span>
                        {s.level !== null && <span className="text-gold-bright tabular-nums">{t("Lv")}{" "}{s.level}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </Collapsible>
      )}

      {has("raw") && raw !== undefined && (
        <Collapsible title={t("Raw API Data")} testId="raw-api-data">
          <p className="mb-2 text-[0.65rem] text-steel/60">{t("The stored response, unmodified — for admin/debugging.")}</p>
          <JsonViewer text={JSON.stringify(raw, null, 2)} className="max-h-80" />
        </Collapsible>
      )}
    </div>
  );
}
