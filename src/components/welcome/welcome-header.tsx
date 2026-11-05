"use client";

import Link from "next/link";
import { useState } from "react";
import { Gauge, Map as MapIcon, Menu, ScanSearch, UserPlus } from "lucide-react";
import { aionButtonPrimary, aionButtonSecondary } from "@/components/aion/styles";
import { SiteLogo } from "@/components/aion/site-logo";
import { SupportButton } from "@/components/support/support-button";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsDeveloper } from "@/lib/auth/me-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/character-lookup", label: "Character Lookup" },
  { href: "/map", label: "Map" },
  { href: "/support", label: "Support" },
];

/** Welcome page header: shown only to signed-out visitors and DEV accounts (the proxy keeps everyone else off "/"). */
export function WelcomeHeader() {
  const t = useT();
  const isDev = useIsDeveloper();
  return (
    <header data-theme="dark" className="sticky top-0 z-30 bg-[var(--header-bg)] text-foreground backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <MobileWelcomeNav isDev={isDev} />

        <Link href="/" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-arcane/40">
          <SiteLogo preload className="h-10 shrink-0" />
          <span className="hidden leading-none sm:block">
            <span className="block font-display text-base font-bold tracking-[0.2em] text-brand-strong">ChumChon AION2</span>
            <span className="mt-1 block text-4xs font-semibold tracking-[0.12em] text-steel">{t("AION2 Player Community")}</span>
          </span>
        </Link>

        <nav aria-label={t("Main")} className="ml-6 hidden items-center gap-5 lg:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="text-sm text-steel transition-colors outline-none hover:text-brand-strong focus-visible:text-brand-strong">
              {t(label)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher className="hidden sm:flex" />
          <ThemeToggle className="hidden sm:flex" />
          {isDev ? (
            <Button asChild className={cn(aionButtonPrimary, "hidden sm:flex")}>
              <Link href="/dev/overview">
                <Gauge className="size-3.5" /> {t("System Overview")}
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" className={cn(aionButtonSecondary, "hidden sm:flex")}>
                <Link href="/login">{t("Login")}</Link>
              </Button>
              <Button asChild className={cn(aionButtonPrimary, "hidden sm:flex")}>
                <Link href="/register">
                  <UserPlus className="size-3.5" /> {t("Create Account")}
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <div aria-hidden className="h-px bg-gradient-to-r via-gold/70 from-transparent to-transparent" />
    </header>
  );
}

function MobileWelcomeNav({ isDev }: { isDev: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("Open navigation")}
        className="flex size-9 items-center justify-center border border-steel/15 text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 lg:hidden"
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="gap-6 border-gold/35 bg-[image:var(--panel-gradient)] p-4">
        <div className="flex items-center gap-2 pt-1 pr-8">
          <SiteLogo className="h-9 shrink-0" />
          <div className="leading-none">
            <SheetTitle className="font-display text-sm font-bold tracking-[0.18em] text-brand-strong">ChumChon AION2</SheetTitle>
            <SheetDescription className="mt-1 text-4xs tracking-[0.12em] text-steel">{t("AION2 Player Community")}</SheetDescription>
          </div>
        </div>
        <nav aria-label={t("Main")} className="flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <SheetClose asChild key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 border border-transparent px-3 py-2.5 text-sm text-steel transition-colors outline-none hover:border-steel/10 hover:bg-surface-hover hover:text-foreground"
              >
                {href === "/character-lookup" && <ScanSearch className="size-4 shrink-0 text-subtle" />}
                {href === "/map" && <MapIcon className="size-4 shrink-0 text-subtle" />}
                {t(label)}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="flex flex-col gap-2">
          {isDev ? (
            <SheetClose asChild>
              <Button asChild className={aionButtonPrimary}>
                <Link href="/dev/overview">
                  <Gauge className="size-3.5" /> {t("System Overview")}
                </Link>
              </Button>
            </SheetClose>
          ) : (
            <>
              <SheetClose asChild>
                <Button asChild variant="outline" className={aionButtonSecondary}>
                  <Link href="/login">{t("Login")}</Link>
                </Button>
              </SheetClose>
              <SheetClose asChild>
                <Button asChild className={aionButtonPrimary}>
                  <Link href="/register">
                    <UserPlus className="size-3.5" /> {t("Create Account")}
                  </Link>
                </Button>
              </SheetClose>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <SupportButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
