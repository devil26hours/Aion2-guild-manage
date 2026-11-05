"use client";

import { useT } from "@/lib/i18n";
import Link from "next/link";
import { SiteLogo } from "@/components/aion/site-logo";
import { GuildEmblem, GuildName, GuildOnly, GuildServerBadge } from "./guild-chrome";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { FeedbackButton } from "@/components/feedback/feedback-dialog";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { ReactNode } from "react";

export function AppHeader({ mobileNavFooter }: { mobileNavFooter?: ReactNode }) {
  const t = useT();
  // Deep blue in both themes: a nested dark scope, so its tokens follow the dark values.
  return (
    <header data-theme="dark" className="sticky top-0 z-30 bg-[var(--header-bg)] text-foreground backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <MobileNav footer={mobileNavFooter} />

        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-arcane/40"
        >
          <SiteLogo preload className="h-10 shrink-0" />
          <span className="hidden leading-none sm:block">
            <span className="block font-display text-base font-bold tracking-[0.2em] text-brand-strong">
              ChumChon AION2
            </span>
            <span className="mt-1 block text-4xs font-semibold tracking-[0.12em] text-steel">
              {t("AION2 Player Community")}
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <GuildOnly>
            <div className="hidden items-center gap-2 border-r border-steel/15 pr-3 md:flex">
              <GuildEmblem className="size-6" iconClassName="size-3.5" />
              <span className="text-xs text-steel">{t("Guild")}</span>
              <span className="font-heading text-sm font-semibold tracking-wide text-foreground">
                <GuildName />
              </span>
            </div>
            <GuildServerBadge className="hidden sm:inline-flex" />
          </GuildOnly>
          <LanguageSwitcher className="hidden sm:flex" />
          <NotificationBell />
          <FeedbackButton />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
      {/* Compact guild / server strip for small screens */}
      <GuildOnly>
        <div className="flex items-center justify-between gap-3 border-t border-steel/10 px-4 py-1.5 md:hidden">
          <span className="flex min-w-0 items-center gap-1.5">
            <GuildEmblem className="size-5" iconClassName="size-3" />
            <span className="truncate font-heading text-xs font-semibold tracking-wide text-foreground">
              <GuildName />
            </span>
          </span>
          <GuildServerBadge className="shrink-0 border-0 bg-transparent px-0 py-0 sm:hidden" />
        </div>
      </GuildOnly>
      {/* Hairline sheen */}
      <div
        aria-hidden
        className="h-px bg-gradient-to-r via-gold/70 from-transparent to-transparent"
      />
    </header>
  );
}
