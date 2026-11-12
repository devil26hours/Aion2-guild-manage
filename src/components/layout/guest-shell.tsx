"use client";

import { LogIn } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { SiteLogo } from "@/components/aion/site-logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { GuestNav } from "@/components/layout/guest-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SupportButton } from "@/components/support/support-button";
import { logout } from "@/lib/auth/client";
import { useT } from "@/lib/i18n";
import mainBgOld from "../../../public/image/background-pic/main_bg.png";
import mainBg from "../../../public/image/background-pic/main_bg_new.jpg";

/** Minimal frame for guests: logo, language/theme, the guest menu (Map first) and one way back to the login page. */
export function GuestShell({ children }: { children: ReactNode }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="aion-app-frame relative flex min-h-dvh flex-1 flex-col bg-[image:var(--app-sky)]">
      <PhotoBackdrop
        src={mainBg}
        crossfadeSrc={mainBgOld}
        scrimClassName="bg-[linear-gradient(rgba(240,245,252,0.82),rgba(240,245,252,0.82))] dark:bg-[linear-gradient(180deg,rgba(5,8,15,0.7)_0%,rgba(5,8,15,0.6)_25%,rgba(5,8,15,0.45)_55%,rgba(5,8,15,0.55)_100%)]"
        moteCount={12}
        sparkleCount={24}
      />
      <header data-theme="dark" className="sticky top-0 z-30 bg-[var(--header-bg)] text-foreground backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <SiteLogo preload className="h-10 shrink-0" />
          <span className="hidden leading-none sm:block">
            <span className="block font-display text-base font-bold tracking-[0.2em] text-brand-strong">ChumChon AION2</span>
            <span className="mt-1 block text-4xs font-semibold tracking-[0.12em] text-steel">{t("AION2 Player Community")}</span>
          </span>
          <span className="ml-2 border border-gold/50 bg-gold/10 px-2 py-0.5 text-3xs font-semibold tracking-wider text-gold-text uppercase">{t("Guest")}</span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher className="hidden sm:flex" />
            <SupportButton label="coffee" />
            <ThemeToggle />
            <button
              type="button"
              disabled={busy}
              data-testid="guest-back-to-login"
              onClick={() => {
                setBusy(true);
                void logout(); // ends the guest session, then goes to /login
              }}
              className="flex h-9 shrink-0 items-center gap-1.5 border border-steel/20 bg-surface/60 px-3 text-xs font-semibold tracking-wider text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30 disabled:opacity-60"
            >
              <LogIn aria-hidden className="size-4" />
              {t("Back to login")}
            </button>
          </div>
        </div>
        <GuestNav />
        <div aria-hidden className="h-px bg-gradient-to-r via-gold/70 from-transparent to-transparent" />
      </header>
      <main className="relative min-w-0 flex-1 px-4 pt-6 pb-8 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
      <SiteFooter className="relative pb-4" />
    </div>
  );
}
