"use client";

import Link from "next/link";
import { Coffee } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Compact, warm link to /support for headers. Same footprint as the Feedback button.
 * `label="coffee"` (app / guest header, next to Feedback): "Buy Me a Coffee", shown from
 * lg up like Feedback's text, icon-only below. Default (login / welcome): "Support us" from sm up.
 */
export function SupportButton({ className, label = "support" }: { className?: string; label?: "support" | "coffee" }) {
  const t = useT();
  const text = label === "coffee" ? t("Buy Me a Coffee") : t("Support us");
  return (
    <Link
      href="/support"
      aria-label={label === "coffee" ? text : t("Support this project")}
      title={label === "coffee" ? text : t("Support this project")}
      data-testid="support-button"
      className={cn(
        "flex h-9 shrink-0 items-center justify-center gap-1.5 border border-gold/50 bg-gold/10 px-2.5 text-gold-text transition-colors outline-none",
        "hover:border-gold/80 hover:bg-gold/20 focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30",
        className,
      )}
    >
      <Coffee aria-hidden className="size-4" />
      <span className={cn("hidden text-xs font-semibold tracking-wider", label === "coffee" ? "lg:inline" : "sm:inline")}>{text}</span>
    </Link>
  );
}
