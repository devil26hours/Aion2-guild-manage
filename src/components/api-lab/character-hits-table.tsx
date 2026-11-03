"use client";


import { useT } from "@/lib/i18n";
import { MousePointerClick } from "lucide-react";
import type { CharacterHit } from "@/lib/aion2-api/types";
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
}: {
  hits: CharacterHit[];
  selectedId: string | null;
  onSelect: (hit: CharacterHit) => void;
  actionLabel?: string;
  testId?: string;
}) {
  const t = useT();
  if (hits.length === 0) return <p className="px-1 py-4 text-sm text-steel">{t("No characters returned.")}</p>;
  return (
    <div className="relative max-h-96 overflow-auto border border-steel/12">
      <table className="w-full min-w-[46rem] text-sm" data-testid={testId}>
        <thead className="sticky top-0 z-10 bg-ink-raised">
          <tr className="border-b border-steel/10 text-left text-[0.65rem] tracking-[0.16em] text-steel/70 uppercase">
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
            const sel = h.character_id === selectedId;
            return (
              <tr
                key={h.character_id}
                className={cn(
                  "border-b border-steel/[0.06] transition-colors last:border-0 hover:bg-white/[0.03]",
                  sel && "bg-gold/[0.08] shadow-[inset_2px_0_0_var(--color-gold)]",
                )}
              >
                <td className="py-1.5 pr-3 pl-3 font-medium text-foreground">{h.name}</td>
                <td className="px-3 py-1.5 text-right text-steel tabular-nums">{h.level ?? "—"}</td>
                <td className="px-3 py-1.5 text-foreground/85">{h.server_name ?? "—"}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-steel">{h.server_id}</td>
                <td className="px-3 py-1.5 text-xs tracking-wider text-steel uppercase">{h.region}</td>
                <td className="max-w-[14rem] truncate px-3 py-1.5 font-mono text-[0.65rem] text-steel/70" title={h.character_id}>
                  {h.character_id}
                </td>
                <td className="py-1.5 pr-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(h)}
                    aria-label={`${actionLabel} ${h.name} on ${h.server_name ?? h.server_id} (${h.region})`}
                    className={cn(
                      "inline-flex items-center gap-1 border px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-arcane/40",
                      sel ? "border-gold/60 bg-gold/15 text-gold-bright" : "border-steel/20 text-steel hover:border-gold-dim/60 hover:text-gold-bright",
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
