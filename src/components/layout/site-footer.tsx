"use client";

import { MessageCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL?.trim();

/** Minimal project-identity footer for the auth pages. */
export function SiteFooter({ className }: { className?: string }) {
  const t = useT();
  return (
    <footer className={cn("space-y-1 text-center text-3xs leading-relaxed text-subtle", className)}>
      <p>{t("An independent community project, built with passion for AION2 players.")}</p>
      <p>{t("Not affiliated with NCSOFT.")}</p>
      <p className="text-subtle">Built by JustKiddingLab © 2026</p>
    </footer>
  );
}

/**
 * Slim always-visible footer of the app frame. Its height comes from
 * --footer-bar-h, set by AppShell, which also reserves that space under the page.
 */
export function FooterBar() {
  const t = useT();
  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 flex h-[var(--footer-bar-h)] items-center justify-between gap-3 border-t border-steel/15 bg-surface/95 px-4 text-4xs leading-snug text-subtle backdrop-blur-md sm:px-6 lg:left-60 lg:px-8">
      <p className="flex min-w-0 flex-col sm:flex-row sm:gap-1.5">
        <span className="hidden truncate xl:inline">
          {t("An independent community project, built with passion for AION2 players.")}
        </span>
        <span className="truncate">{t("Not affiliated with NCSOFT.")}</span>
        <span className="truncate">Built by JustKiddingLab © 2026</span>
      </p>
      {DISCORD_URL && (
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Contact us on Discord")}
          className="flex h-7 shrink-0 items-center gap-1.5 border border-steel/15 px-2 font-semibold text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          Discord
        </a>
      )}
    </footer>
  );
}
