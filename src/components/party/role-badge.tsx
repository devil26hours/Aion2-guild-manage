"use client";

import { useT } from "@/lib/i18n";
import { CircleDashed, Cross, Shield, Sparkle, Swords, type LucideIcon } from "lucide-react";
import { ROLE_COLORS, type PartyRole } from "@/lib/party/types";
import { cn } from "@/lib/utils";

export const ROLE_ICONS: Record<PartyRole, LucideIcon> = {
  Tank: Shield,
  Healer: Cross,
  Support: Sparkle,
  DPS: Swords,
};

/** Role identity = icon + label + color (never color alone). */
export function RoleBadge({ role, className }: { role: PartyRole | null; className?: string }) {
  const t = useT();
  if (!role) {
    return (
      <span className={cn("inline-flex items-center gap-1 border border-dashed border-steel/30 px-1.5 py-px text-4xs font-semibold tracking-[0.12em] text-steel/70 uppercase", className)}>
        <CircleDashed className="size-3" aria-hidden />
        {t("No role")}</span>
    );
  }
  const Icon = ROLE_ICONS[role];
  const c = ROLE_COLORS[role];
  return (
    <span
      className={cn("inline-flex items-center gap-1 border px-1.5 py-px text-4xs font-semibold tracking-[0.12em] uppercase", className)}
      style={{ color: c, borderColor: `${c}66`, backgroundColor: `${c}1a` }}
    >
      <Icon className="size-3" aria-hidden />
      {role}
    </span>
  );
}
