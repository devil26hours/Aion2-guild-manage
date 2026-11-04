"use client";

import Link from "next/link";
import { Coffee, MessageCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL?.trim();

/** Warm "Buy Me a Coffee" link to /support, shared by the footers. */
function SupportLink({ className }: { className?: string }) {
  const t = useT();
  return (
    <Link
      href="/support"
      data-testid="footer-support"
      className={cn(
        "flex items-center justify-center gap-2 rounded-full border border-gold/60 bg-gold/15 font-semibold text-gold-text shadow-sm transition-colors outline-none",
        "hover:border-gold hover:bg-gold/25 focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30",
        className,
      )}
    >
      <Coffee className="size-4" aria-hidden />
      {t("Buy Me a Coffee")}
    </Link>
  );
}

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
export function SiteFooter({ className, support = false }: { className?: string; support?: boolean }) {
  const t = useT();
  return (
    <footer className={cn("space-y-1.5 text-left text-2xs leading-relaxed text-subtle", className)}>
      <p>{t("An independent community project, built with passion for AION2 players.")}</p>
      <p>{t("Not affiliated with NCSOFT.")}</p>
      <p>
        Built by JustKiddingLab © 2026 · <CookiePolicyLink />
      </p>
      {support && (
        <p className="pt-2">
          <SupportLink className="inline-flex h-9 px-4 text-xs" />
        </p>
      )}
    </footer>
  );
}

/**
 * Always-visible footer of the app frame. Its height comes from --footer-bar-h, set by
 * AppShell, which also reserves that space under the page. Stacked on mobile (actions above
 * the text), one row from sm up.
 */
export function FooterBar() {
  const t = useT();
  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 flex h-[var(--footer-bar-h)] flex-col items-start justify-center gap-2.5 border-t border-steel/15 bg-surface/95 px-4 text-xs leading-relaxed text-subtle backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:left-60 lg:px-8">
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
      <div className="order-1 flex shrink-0 items-center gap-3 sm:order-2">
        <SupportLink className="h-9 px-4 text-xs" />
        {DISCORD_URL && (
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
        )}
      </div>
    </footer>
  );
}
