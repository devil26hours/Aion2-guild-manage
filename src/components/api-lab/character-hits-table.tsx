"use client";


import { useT } from "@/lib/i18n";
import { MousePointerClick } from "lucide-react";
import type { CharacterHit } from "@/lib/aion2-api/types";
import { regionLabel } from "@/lib/aion2-api/endpoints";
import { cn } from "@/lib/utils";

/**
 * Search results / 409 candidates. Names are NOT unique, so rows are keyed
 * by `character_id` and the server is always shown next to the name.
 */
export function CharacterHitsTable({
  hits,
  selectedId,
  onSelect,
  actionLabel = "Select",
  testId,
  multi,
}: {
  hits: CharacterHit[];
  selectedId: string | null;
  onSelect: (hit: CharacterHit) => void;
  actionLabel?: string;
  testId?: string;
  /** Checkbox mode: `isChecked` / `isDisabled` per hit, `onToggle` instead of `onSelect`. */
  multi?: { isChecked: (hit: CharacterHit) => boolean; isDisabled: (hit: CharacterHit) => string | null; onToggle: (hit: CharacterHit) => void };
}) {
  const t = useT();
  if (hits.length === 0) return <p className="px-1 py-4 text-sm text-steel">{t("No characters returned.")}</p>;
  return (
    <div className="relative max-h-96 overflow-auto border border-steel/12">
      <table className="w-full min-w-[46rem] text-sm" data-testid={testId}>
        <thead className="sticky top-0 z-10 bg-surface-raised">
          <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-subtle uppercase">
            <th scope="col" className="py-2 pr-3 pl-3 font-medium">{t("Character Name")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t("Level")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Server Name")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Server ID")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Region")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t("Character ID")}</th>
            <th scope="col" className="py-2 pr-3 pl-3"><span className="sr-only">{t("Action")}</span></th>
          </tr>
        </thead>
        <tbody>
          {hits.map((h) => {
            const lock = multi?.isDisabled(h) ?? null;
            const sel = multi ? multi.isChecked(h) : h.character_id === selectedId;
            return (
              <tr
                key={`${h.region}:${h.server_id}:${h.character_id}`}
                className={cn(
                  "border-b border-steel/[0.06] transition-colors last:border-0 hover:bg-surface-hover",
                  sel && "bg-brand/[0.08] shadow-[inset_2px_0_0_var(--brand)]",
                )}
              >
                <td className="py-1.5 pr-3 pl-3 font-medium text-foreground">{h.name}</td>
                <td className="px-3 py-1.5 text-right text-steel tabular-nums">{h.level ?? "—"}</td>
                <td className="px-3 py-1.5 text-foreground/85">{h.server_name ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-steel">{h.server_id}</td>
                <td className="px-3 py-1.5 text-xs text-steel">{regionLabel(h.region)}</td>
                <td className="max-w-[14rem] truncate px-3 py-1.5 font-mono text-3xs text-subtle" title={h.character_id}>
                  {h.character_id}
                </td>
                <td className="py-1.5 pr-3 pl-3 text-right">
                  <button
                    type="button"
                    disabled={!!lock}
                    title={lock ?? undefined}
                    aria-pressed={multi ? sel : undefined}
                    onClick={() => (multi ? multi.onToggle(h) : onSelect(h))}
                    aria-label={`${actionLabel} ${h.name} on ${h.server_name ?? h.server_id} (${regionLabel(h.region)})`}
                    className={cn(
                      "inline-flex items-center gap-1 border px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-arcane/40 disabled:cursor-not-allowed disabled:opacity-40",
                      sel ? "border-brand/60 bg-brand/15 text-brand-strong" : "border-steel/20 text-steel hover:border-brand-muted/60 hover:text-brand-strong",
                    )}
                  >
                    <MousePointerClick className="size-3" />
                    {sel ? t("Selected") : actionLabel}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
