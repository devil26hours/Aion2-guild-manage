"use client";

import { useT } from "@/lib/i18n";
import { CircleAlert, Info, Scale, TriangleAlert } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { CLASS_META } from "@/lib/aion/classes";
import { knownClass } from "@/lib/roster/party-adapter";
import { formatNumber } from "@/lib/format";
import { BALANCE_GUIDE, balanceThresholds, type PartyAnalysis, type WarningLevel } from "@/lib/party/analysis";
import { PARTY_ROLES, ROLE_COLORS } from "@/lib/party/types";
import { cn } from "@/lib/utils";
import { ROLE_ICONS } from "./role-badge";

const LEVEL_STYLE: Record<WarningLevel, { icon: typeof Info; cls: string }> = {
  error: { icon: CircleAlert, cls: "border-destructive/40 border-l-destructive bg-destructive/10 text-danger-text" },
  warning: { icon: TriangleAlert, cls: "border-warning/30 border-l-warning bg-warning/[0.07] text-warning-text" },
  info: { icon: Info, cls: "border-arcane/25 border-l-arcane bg-arcane/[0.06] text-info-text" },
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-steel/10 bg-surface/50 px-3 py-2">
      <p className="text-4xs tracking-[0.16em] text-subtle uppercase">{label}</p>
      <p className="font-heading text-lg font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function PartyAnalysisPanel({ analysis }: { analysis: PartyAnalysis }) {
  const t = useT();
  const filled = analysis.filled.length;
  const classes = Object.keys(analysis.classCounts).sort((a, b) => analysis.classCounts[b] - analysis.classCounts[a] || a.localeCompare(b));
  const size = analysis.size;
  const limits = balanceThresholds(size);
  return (
    <SectionPanel title={t("Party Analysis")} icon={Scale} description={`${filled} / ${size} slots filled`}>
      <div className="grid grid-cols-2 gap-2" data-testid="party-stats">
        <Stat label={t("Total CP")} value={formatNumber(analysis.totalCp)} />
        <Stat label={t("Average CP")} value={filled ? formatNumber(analysis.averageCp) : "—"} />
        <Stat label={t("Avg Item Level")} value={filled ? String(analysis.averageItemLevel) : "—"} />
        <Stat label={t("Classes")} value={String(classes.length)} />
      </div>

      <h3 className="mt-4 mb-2 text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Role Distribution")}</h3>
      <ul className="space-y-1.5">
        {[...PARTY_ROLES, "Unassigned" as const].map((r) => {
          const n = analysis.roleCounts[r];
          const Icon = r === "Unassigned" ? null : ROLE_ICONS[r];
          const color = r === "Unassigned" ? "var(--steel)" : ROLE_COLORS[r];
          return (
            <li key={r} className="grid grid-cols-[6.5rem_1fr_1.5rem] items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-steel">
                {Icon && <Icon className="size-3" style={{ color }} aria-hidden />}
                {r}
              </span>
              <span className="h-2 bg-steel/[0.07]">
                <span className="block h-full rounded-r-[3px]" style={{ width: `${(n / size) * 100}%`, backgroundColor: color }} />
              </span>
              <span className="text-right font-semibold text-foreground tabular-nums">{n}</span>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 mb-2 text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Class Distribution")}</h3>
      {classes.length === 0 ? (
        <p className="text-xs text-subtle">{t("No characters assigned.")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <li key={c} className="flex items-center gap-1.5 border border-steel/15 px-2 py-1 text-xs text-foreground/90">
              <span aria-hidden className="size-2 rotate-45" style={{ backgroundColor: knownClass(c) ? CLASS_META[knownClass(c)!].color : "var(--steel)" }} />
              {c}
              <span className="font-semibold tabular-nums">×{analysis.classCounts[c]}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 mb-2 text-3xs font-semibold tracking-[0.18em] text-brand uppercase">{t("Warnings")}</h3>
      {analysis.warnings.length === 0 ? (
        <p className="border border-success/25 bg-success/[0.06] px-3 py-2 text-xs text-success-text">{t("No issues found.")}</p>
      ) : (
        <ul className="space-y-1.5" aria-live="polite" data-testid="party-warnings">
          {analysis.warnings.map((w, i) => {
            const { icon: Icon, cls } = LEVEL_STYLE[w.level];
            return (
              <li key={`${w.code}-${i}`} data-code={w.code} className={cn("flex items-start gap-2 border border-l-2 px-2.5 py-1.5 text-xs", cls)}>
                <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>{t(w.i18n.key, w.i18n.vars)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-3xs text-subtle">
        {t("Balance warnings are planning guidelines for this")}{" "}{size}{t("-member party (≥")}{limits.classStack} {" "}{t("of one class")}{Number.isFinite(limits.roleHeavy) && <>, ≥{limits.roleHeavy} {" "}{t("of one role")}</>}{t(", a member ≥")}{BALANCE_GUIDE.cpGapPct}{t("% below average CP) — not game rules. No class or role is restricted.")}</p>
    </SectionPanel>
  );
}
