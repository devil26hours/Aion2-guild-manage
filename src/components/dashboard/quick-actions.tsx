"use client";

import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ChevronRight, History, Swords, Users, Zap, type LucideIcon } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";

const ACTIONS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/members", label: "Manage Members", description: "Roster, ranks & equipment", icon: Users },
  { href: "/party-builder", label: "Create Party", description: "Assemble a 10-player raid party", icon: Swords },
  { href: "/character-history", label: "View Character History", description: "CP & item level progression", icon: History },
];

export function QuickActions() {
  const t = useT();
  return (
    <SectionPanel title={t("Quick Actions")} icon={Zap}>
      <div className="grid gap-2.5">
        {ACTIONS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 border border-steel/12 bg-ink/50 p-3 transition-all outline-none hover:border-gold-dim/60 hover:bg-gold/[0.04] focus-visible:border-arcane/60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center border border-gold-dim/40 bg-gradient-to-b from-gold/15 to-transparent text-gold transition-colors group-hover:text-gold-bright">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{t(label)}</span>
              <span className="block truncate text-xs text-steel/70">{t(description)}</span>
            </span>
            <ChevronRight className="size-4 text-steel/50 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
          </Link>
        ))}
      </div>
    </SectionPanel>
  );
}
