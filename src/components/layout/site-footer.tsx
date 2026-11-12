"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL?.trim();

function CookiePolicyLink({ className }: { className?: string }) {
  const t = useT();
  return (
    <Link
      href="/cookie-policy"
      data-testid="footer-cookie-policy"
      className={cn("underline-offset-4 transition-colors outline-none hover:text-brand-strong hover:underline focus-visible:text-brand-strong focus-visible:underline", className)}
    >
      {t("Cookie Policy")}
    </Link>
  );
}

/** Project-identity footer for the auth pages and the guest frame. */
export function SiteFooter({ className }: { className?: string }) {
  const t = useT();
  return (
    <footer className={cn("space-y-1.5 text-center text-2xs leading-relaxed text-subtle", className)}>
      <p>{t("An independent community project, built with passion for AION2 players.")}</p>
      <p>{t("Not affiliated with NCSOFT.")}</p>
      <p>
        Built by JustKiddingLab © 2026 · <CookiePolicyLink />
      </p>
    </footer>
  );
}

/**
 * Footer of the app frame. Part of the normal page flow: AppShell is a full-height
 * column, so on short pages it sits at the bottom of the window and on long pages it
 * comes after the content (reached by scrolling). It never floats over the page.
 * Stacked on mobile (Discord above the text), one row from sm up.
 */
export function FooterBar() {
  const t = useT();
  return (
    <footer className="relative flex flex-col items-start justify-center gap-2.5 border-t border-steel/15 bg-surface/95 px-4 py-4 text-xs leading-relaxed text-subtle backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-3 lg:px-8" data-testid="app-footer">
      <div className="order-2 flex min-w-0 flex-col items-start gap-0.5 text-left sm:order-1">
        <p className="hidden xl:block">{t("An independent community project, built with passion for AION2 players.")}</p>
        <p className="flex flex-wrap items-center justify-start gap-x-2">
          <span>{t("Not affiliated with NCSOFT.")}</span>
          <span aria-hidden>·</span>
          <span>Built by JustKiddingLab © 2026</span>
          <span aria-hidden>·</span>
          <CookiePolicyLink />
        </p>
      </div>
      {DISCORD_URL && (
        <div className="order-1 flex shrink-0 items-center gap-3 sm:order-2">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("Contact us on Discord")}
            className="flex h-9 items-center gap-2 rounded-full border border-steel/25 px-4 text-xs font-semibold text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30"
          >
            <MessageCircle className="size-4" aria-hidden />
            Discord
          </a>
        </div>
      )}
    </footer>
  );
}
