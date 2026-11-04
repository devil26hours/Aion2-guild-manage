"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { aionButtonPrimary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { acknowledgeCookieNotice, useCookieNoticeAcknowledged } from "@/lib/cookie-notice";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * One-time notice for first-time visitors. There are no optional cookies to accept or reject:
 * the site sets only strictly necessary and user-requested cookies. Closing the page does not
 * record anything; only the button does.
 */
export function CookieNotice() {
  const t = useT();
  const acknowledged = useCookieNoticeAcknowledged();
  const pathname = usePathname();
  if (acknowledged || pathname === "/cookie-policy") return null;
  return (
    <section
      aria-label={t("Cookie notice")}
      data-testid="cookie-notice"
      className={cn(
        "fixed inset-x-3 bottom-3 z-50 rounded-xl border border-gold/45 bg-[image:var(--panel-gradient)] p-4 shadow-dialog",
        "sm:right-auto sm:bottom-4 sm:left-4 sm:max-w-md",
      )}
    >
      <p className="flex items-center gap-2 font-heading text-xs font-semibold tracking-[0.12em] text-foreground">
        <Cookie aria-hidden className="size-4 text-gold-text" />
        {t("Cookies on this website")}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-subtle">
        {t("We only use cookies and browser storage that are necessary for signing in or that remember choices you make, such as language and theme. We do not use analytics, advertising or tracking cookies.")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" data-testid="cookie-notice-ok" onClick={acknowledgeCookieNotice} className={cn(aionButtonPrimary, "h-9")}>
          {t("Understood")}
        </Button>
        <Link href="/cookie-policy" className="text-xs font-semibold text-brand-strong underline underline-offset-4 outline-none hover:text-gold-text focus-visible:ring-2 focus-visible:ring-arcane/40">
          {t("Cookie Policy")}
        </Link>
      </div>
    </section>
  );
}
