"use client";

import type { ReactNode } from "react";
import { FramedPanel } from "@/components/aion/framed-panel";
import { OrnamentDivider } from "@/components/aion/ornaments";
import { SiteLogo } from "@/components/aion/site-logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Branded frame for the signed-out / onboarding pages (login, register, guild setup). */
export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
  topRight,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  topRight?: ReactNode;
}) {
  const t = useT();
  return (
    <>
      <div className="absolute top-4 right-4 flex items-center gap-2 sm:top-6 sm:right-6">
        {topRight}
        <LanguageSwitcher />
      </div>
      <div className={cn("aion-enter relative w-full", wide ? "max-w-4xl" : "max-w-[26rem]")}>
        <header className="mb-7 flex flex-col items-center text-center">
          <SiteLogo preload className="mb-3 h-24 drop-shadow-[0_0_14px_rgba(95,168,255,0.45)] sm:h-28" />
          <h1 className="font-heading leading-none">
            <span className="block bg-gradient-to-b from-[#f6e7c3] via-[#d9b874] to-[#8f7238] bg-clip-text text-4xl font-bold tracking-[0.18em] text-transparent drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-5xl">
              AION II
            </span>
            <span className="mt-2 block text-sm font-semibold tracking-[0.5em] text-gold-bright/90 sm:text-base">GUILD COMMAND</span>
          </h1>
          <OrnamentDivider className="mt-4" />
          <p className="mt-3 text-2xs tracking-[0.32em] text-steel uppercase">{t("Guild Management System")}</p>
        </header>
        <FramedPanel className="px-6 pt-7 pb-6 sm:px-9 sm:pt-9 sm:pb-8">
          <div className="mb-6 text-center">
            <h2 className="font-heading text-lg font-semibold tracking-[0.12em] text-foreground">{t(title)}</h2>
            {subtitle && <p className="mt-1 text-xs text-steel/80">{t(subtitle)}</p>}
          </div>
          {children}
        </FramedPanel>
        <footer className="mt-6 text-center text-3xs tracking-[0.2em] text-steel/50 uppercase">{t("Unofficial companion · Not affiliated with NCSOFT")}</footer>
      </div>
    </>
  );
}
