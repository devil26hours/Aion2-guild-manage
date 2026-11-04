"use client";

import Link from "next/link";
import { Coffee } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Compact, warm link to /support for headers (login page). Same footprint as the Feedback button. */
export function SupportButton({ className }: { className?: string }) {
  const t = useT();
  return (
    <Link
      href="/support"
      aria-label={t("Support this project")}
      title={t("Support this project")}
      data-testid="support-button"
      className={cn(
        "flex h-9 shrink-0 items-center justify-center gap-1.5 border border-gold/50 bg-gold/10 px-2.5 text-gold-text transition-colors outline-none",
        "hover:border-gold/80 hover:bg-gold/20 focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30",
        className,
      )}
    >
      <Coffee aria-hidden className="size-4" />
      <span className="hidden text-xs font-semibold tracking-wider sm:inline">{t("Support us")}</span>
    </Link>
  );
}
