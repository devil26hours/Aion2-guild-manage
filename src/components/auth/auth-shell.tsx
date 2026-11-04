"use client";

import type { ReactNode } from "react";
import { FramedPanel } from "@/components/aion/framed-panel";
import { OrnamentDivider } from "@/components/aion/ornaments";
import { SiteLogo } from "@/components/aion/site-logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { SiteFooter } from "@/components/layout/site-footer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Branded frame for the signed-out / onboarding pages (login, register, guild setup). */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
  topRight,
  onPhoto = false,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  topRight?: ReactNode;
  /** Set over PhotoBackdrop: everything outside the panel uses the dark tokens in both themes. */
  onPhoto?: boolean;
  /** Tighter sizing on PC so the page fits one screen without scrolling. */
  compact?: boolean;
}) {
  const t = useT();
  const chromeTheme = onPhoto ? "dark" : undefined;
  // The small lines under the wordmark can land on bright parts of the photo, so they need a tighter shadow.
  const taglineShadow = onPhoto && "[text-shadow:0_1px_2px_rgba(0,0,0,1),0_0_6px_rgba(0,0,0,0.9)]";
  return (
    <>
      <div data-theme={chromeTheme} className="absolute top-4 right-4 flex items-center gap-2 sm:top-6 sm:right-6">
        {topRight}
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className={cn("aion-enter relative w-full", wide ? "max-w-4xl" : "max-w-[26rem]")}>
        <header data-theme={chromeTheme} className={cn("mb-7 flex flex-col items-center text-center", compact && "pc:mb-2")}>
          <SiteLogo preload className={cn("mb-3 h-32 sm:h-44", compact && "pc:mb-1 pc:h-[clamp(4.5rem,12dvh,8rem)]")} />
          <h1 className="font-display leading-none">
            <span className={cn("block bg-[image:var(--wordmark)] bg-clip-text text-4xl font-bold tracking-[0.18em] text-transparent drop-shadow-[var(--wordmark-shadow)] sm:text-5xl", compact && "pc:text-4xl/none")}>
              ChumChon
            </span>
            <span className={cn("mt-2 block text-sm font-semibold tracking-[0.5em] text-gold-text sm:text-base", compact && "pc:mt-1 pc:text-sm", taglineShadow)}>AION2</span>
          </h1>
          <OrnamentDivider className={cn("mt-4", compact && "pc:mt-1")} />
          <p className={cn("mt-3 text-2xs tracking-[0.2em] text-foreground", compact && "pc:mt-1", taglineShadow)}>{t("AION2 Player Community")}</p>
        </header>
        <FramedPanel className={cn("px-6 pt-7 pb-6 sm:px-9 sm:pt-9 sm:pb-8", compact && "pc:pt-4 pc:pb-4", onPhoto && "aion-glass")}>
          <div className={cn("mb-6 text-center", compact && "pc:mb-3")}>
            <h2 className="font-heading text-lg font-semibold tracking-[0.12em] text-foreground">{t(title)}</h2>
            {subtitle && <p className="mt-1 text-xs text-subtle">{t(subtitle)}</p>}
          </div>
          {children}
        </FramedPanel>
        <div data-theme={chromeTheme} className={cn(onPhoto && "[text-shadow:0_1px_3px_rgba(0,0,0,0.9)]")}>
          <SiteFooter className={cn("mt-6", compact && "pc:mt-2 pc:space-y-0 pc:leading-snug")} />
        </div>
      </div>
    </>
  );
}
