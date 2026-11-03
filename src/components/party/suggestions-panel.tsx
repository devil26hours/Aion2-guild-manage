"use client";


import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Check, Lightbulb, X } from "lucide-react";
import { RosterClassBadge } from "@/components/roster/roster-class-badge";
import { SectionPanel } from "@/components/aion/section-panel";
import { aionButtonPrimary, aionButtonSecondary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import type { Suggestion } from "@/lib/party/suggest";
import { suggestionTemplate } from "@/lib/party/suggest";
import { cn } from "@/lib/utils";
import { RoleBadge } from "./role-badge";

/**
 * Suggestion preview. Nothing is assigned until the leader accepts —
 * individually or all at once.
 */
export function SuggestionsPanel({
  size,
  emptyCount,
  onGenerate,
  suggestions,
  onAccept,
  onDismiss,
}: {
  size: number;
  emptyCount: number;
  onGenerate: () => void;
  suggestions: Suggestion[] | null;
  onAccept: (items: Suggestion[]) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const live = suggestions?.filter((s) => !rejected.has(s.index)) ?? [];
  const tpl = suggestionTemplate(size);

  return (
    <SectionPanel
      title={t("Auto-Balance Suggestions")}
      icon={Lightbulb}
      description={t("Fills empty slots only — you stay in control")}
    >
      {suggestions === null ? (
        <div className="space-y-3">
          <p className="text-xs text-steel">
            {t("Suggests characters for the")}{" "}{emptyCount} empty {emptyCount === 1 ? "slot" : "slots"} {" "}{t("using CP, item level, class variety and a starting role mix for a")}{" "}{size}{t("-member party of")}{" "}{tpl.Tank} {" "}{t("Tank /")}{" "}{tpl.Healer} {" "}{t("Healer /")}{" "}{tpl.Support} {" "}{t("Support /")}{" "}
            {tpl.DPS} {" "}{t("DPS. It is a simple heuristic, not an optimal composition.")}</p>
          <Button type="button" onClick={() => { setRejected(new Set()); onGenerate(); }} disabled={emptyCount === 0} className={cn(aionButtonPrimary, "w-full")}>
            <Lightbulb className="size-3.5" />
            {t("Suggest Characters")}</Button>
          {emptyCount === 0 && <p className="text-center text-2xs text-steel/60">{t("All slots are filled.")}</p>}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-steel">{t("No available characters to suggest.")}</p>
          <Button type="button" variant="outline" onClick={onDismiss} className={cn(aionButtonSecondary, "w-full")}>{t("Close")}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-1.5" data-testid="suggestions">
            {suggestions.map((s) => {
              const off = rejected.has(s.index);
              return (
                <li key={s.index} className={cn("flex items-center gap-2 border border-steel/12 bg-ink/50 px-2.5 py-2", off && "opacity-40")}>
                  <span className="flex size-6 shrink-0 items-center justify-center border border-steel/25 text-3xs font-bold text-steel tabular-nums">{s.index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                      {s.member.character_name}
                      <RoleBadge role={s.role} />
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-2xs text-steel/70">
                      <RosterClassBadge className={s.member.class_name} /> {s.reasonParts.map((p) => t(p.key, p.vars)).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={off ? t("Restore suggestion for slot {n}", { n: s.index + 1 }) : t("Skip suggestion for slot {n}", { n: s.index + 1 })}
                    onClick={() => setRejected((r) => { const n = new Set(r); if (n.has(s.index)) n.delete(s.index); else n.add(s.index); return n; })}
                    className="flex size-7 items-center justify-center border border-steel/20 text-steel hover:text-foreground"
                  >
                    {off ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onDismiss} className={cn(aionButtonSecondary, "flex-1")}>{t("Dismiss")}</Button>
            <Button type="button" onClick={() => onAccept(live)} disabled={live.length === 0} className={cn(aionButtonPrimary, "flex-1")}>
              <Check className="size-3.5" />
              {t("Apply")}{" "}{live.length}
            </Button>
          </div>
        </div>
      )}
    </SectionPanel>
  );
}
