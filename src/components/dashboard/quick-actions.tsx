"use client";

import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ChevronRight, History, Swords, Users, Zap, type LucideIcon } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { cn } from "@/lib/utils";

const ACTIONS: { href: string; label: string; description: string; icon: LucideIcon; tile: string }[] = [
  { href: "/members", label: "Manage Members", description: "Roster, ranks & equipment", icon: Users, tile: "border-brand/40 bg-brand/10 text-brand" },
  { href: "/party-builder", label: "Create Party", description: "Assemble a 10-player raid party", icon: Swords, tile: "border-mystic/40 bg-mystic/10 text-mystic" },
  { href: "/character-history", label: "View Character History", description: "CP & item level progression", icon: History, tile: "border-arcane/40 bg-arcane/10 text-arcane" },
];

export function QuickActions() {
  const t = useT();
  return (
    <SectionPanel title={t("Quick Actions")} icon={Zap}>
      <div className="grid gap-2.5">
        {ACTIONS.map(({ href, label, description, icon: Icon, tile }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 border border-steel/15 bg-surface p-3 transition-all outline-none hover:border-gold/60 hover:bg-surface-hover focus-visible:border-arcane/60"
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center border transition-colors", tile)}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{t(label)}</span>
              <span className="block truncate text-xs text-subtle">{t(description)}</span>
            </span>
            <ChevronRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        ))}
      </div>
    </SectionPanel>
  );
}
