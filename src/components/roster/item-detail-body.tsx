"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isEmptyItemDetail, type ItemDetailView } from "@/lib/roster/item-details";
import type { ItemDetailEntry } from "@/lib/roster/item-details-store";
import { gradeColor } from "@/lib/roster/profile-view";
import { ApiIcon, GradeLabel } from "./api-icon";

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-1 text-5xs font-semibold tracking-[0.2em] text-gold/70 uppercase">{children}</h4>;
}

/**
 * Detail section inside the equipment tooltip for one item's per-item cache
 * entry. `null` means the hover request is about to start, so it shows the
 * same small loading line as a pending request.
 */
export function ItemDetailSection({ entry }: { entry: ItemDetailEntry | null }) {
  const t = useT();
  if (entry?.status === "ready") return <ItemDetailBody detail={entry.detail} />;
  if (entry?.status === "error") {
    return (
      <p role="alert" className="mt-3 flex items-start gap-1.5 border-t border-steel/15 pt-2 text-4xs leading-snug text-[#f6c2b6]" data-testid="item-detail-error">
        <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          {t("Could not load item details:")}{" "}{entry.message}{" "}
          <span className="text-steel/70">{t("Hover again or click the item to retry.")}</span>
        </span>
      </p>
    );
  }
  return (
    <p role="status" aria-live="polite" className="mt-3 flex items-center gap-1.5 border-t border-steel/15 pt-2 text-4xs text-steel/70" data-testid="item-detail-loading">
      <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      {t("Loading item details…")}
    </p>
  );
}

export function ItemDetailBody({ detail }: { detail: ItemDetailView }) {
  const t = useT();
  if (isEmptyItemDetail(detail)) {
    return <p className="mt-3 border-t border-steel/15 pt-2 text-4xs text-steel/60">{t("No detail fields in the API response for this item.")}</p>;
  }
  return (
    <div className="mt-3 space-y-2 border-t border-steel/15 pt-2 text-xs" data-testid="item-detail">
      {detail.soulBindRate !== null && (
        <p className="flex items-center justify-between gap-2" data-testid="soul-bind-rate">
          <span className="text-4xs font-semibold tracking-[0.18em] text-[#b99cff] uppercase">{t("Soul Binding")}</span>
          <span className="border border-[#b99cff]/45 bg-[#b99cff]/[0.12] px-1.5 py-px font-heading text-sm font-bold text-[#d9c8ff] tabular-nums shadow-[0_0_12px_-4px_#b99cff]">
            {detail.soulBindRate}
          </span>
        </p>
      )}

      {detail.mainStats.length > 0 && (
        <div data-testid="main-stats">
          <Heading>{t("Main Stats")}</Heading>
          <dl className="space-y-px">
            {detail.mainStats.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-baseline justify-between gap-2">
                <dt className="min-w-0 truncate text-steel" title={s.name}>{s.name}</dt>
                <dd className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  {s.minValue !== null && s.minValue !== s.value && <span className="text-steel/55">{s.minValue} ~</span>}
                  <span className="font-semibold text-foreground">{s.value ?? "—"}</span>
                  {s.extra !== null && s.extra !== "0" && <span className="text-[#9af0b3]">(+{s.extra})</span>}
                  {s.exceed !== null && (
                    <span className="border border-gold-dim/50 px-1 text-5xs font-semibold tracking-[0.1em] text-gold-bright uppercase" title={t("Exceed")}>
                      {s.exceed === true ? t("Exceed") : `${t("Exceed")} ${s.exceed}`}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {detail.subStats.length > 0 && (
        <div data-testid="sub-stats">
          <Heading>{t("Soul Binding Stats")}</Heading>
          <table className="w-full">
            <thead className="sr-only">
              <tr><th scope="col">{t("Stat")}</th><th scope="col">{t("Value")}</th></tr>
            </thead>
            <tbody>
              {detail.subStats.map((s, i) => (
                <tr key={`${s.name}-${i}`}>
                  <th scope="row" className="truncate py-px text-left font-normal text-[#c9b8f5]/85">{s.name}</th>
                  <td className="py-px text-right font-semibold text-[#e2d6ff] tabular-nums">{s.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail.subSkills !== null && detail.subSkills.length > 0 && (
        <div data-testid="sub-skills">
          <Heading>{t("Sub Skills")}</Heading>
          <ul className="space-y-1">
            {detail.subSkills.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                {s.icon && <ApiIcon src={s.icon} alt={s.name ?? t("Sub Skill")} size={20} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-foreground/90">{s.name ?? s.extra.map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>
                    {s.level !== null && <span className="shrink-0 text-gold-bright tabular-nums">{t("Lv")} {s.level}</span>}
                  </span>
                  {s.desc && <span className="block text-4xs leading-snug whitespace-pre-line text-steel/70">{s.desc}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.magicStones.length > 0 && (
        <div data-testid="magic-stones">
          <Heading>{t("Magic Stones")}</Heading>
          <ul className="space-y-1">
            {detail.magicStones.map((s, i) => (
              <li key={`${s.slotPos ?? i}-${s.name}`} className="flex items-center gap-1.5">
                <ApiIcon src={s.icon} alt={s.name} size={22} color={gradeColor(s.grade)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ color: gradeColor(s.grade) }} title={s.name}>{s.name}</span>
                  {(s.grade || s.slotPos !== null) && (
                    <span className="flex items-center gap-1.5">
                      <GradeLabel grade={s.grade} />
                      {s.slotPos !== null && <span className="text-5xs text-steel/50">{t("Slot")} {s.slotPos}</span>}
                    </span>
                  )}
                </span>
                {s.value !== null && <span className="shrink-0 font-semibold text-foreground tabular-nums">{s.value}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.godStones.length > 0 && (
        <div data-testid="god-stones">
          <Heading>{t("God Stone")}</Heading>
          <ul className="space-y-1.5">
            {detail.godStones.map((s, i) => (
              <li key={`${s.slotPos ?? i}-${s.name}`} className="flex items-start gap-1.5">
                <ApiIcon src={s.icon} alt={s.name} size={26} color={gradeColor(s.grade)} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span style={{ color: gradeColor(s.grade) }}>{s.name}</span>
                    <GradeLabel grade={s.grade} />
                    {s.slotPos !== null && <span className="text-5xs text-steel/50">{t("Slot")} {s.slotPos}</span>}
                  </span>
                  {s.desc && <span className="mt-0.5 block text-4xs leading-snug whitespace-pre-line text-steel/75">{s.desc}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
