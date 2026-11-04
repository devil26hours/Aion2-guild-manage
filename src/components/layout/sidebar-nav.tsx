"use client";


import { useT } from "@/lib/i18n";
import { Fragment, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/auth/me-store";
import { DEV_NAV_ITEMS, NAV_ITEMS, NO_GUILD_NAV_ITEMS, isNavActive } from "./nav-items";

type NavProps = { onNavigate?: () => void };

/**
 * `usePathname()` is runtime data on dynamic routes (e.g. /members/[id]),
 * so the active-state nav streams in behind Suspense. The fallback is the
 * same list without highlighting, keeping the static shell intact.
 */
export function SidebarNav(props: NavProps) {
  return (
    <Suspense fallback={<NavList pathname={null} {...props} />}>
      <ActiveNavList {...props} />
    </Suspense>
  );
}

function ActiveNavList(props: NavProps) {
  const pathname = usePathname();
  return <NavList pathname={pathname} {...props} />;
}

function NavList({ pathname, onNavigate }: NavProps & { pathname: string | null }) {
  const t = useT();
  const { me, status } = useMe();
  // Membership unknown yet: don't guess a role's menu (the full guild menu would flash for No-Guild users).
  if (!me && status !== "error") {
    return (
      <nav aria-label={t("Main")} aria-busy="true" className="flex flex-col gap-1">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 border border-transparent px-3 py-2.5">
            <span className="size-4 shrink-0 animate-pulse rounded-sm bg-steel/15" />
            <span className="h-3.5 w-28 animate-pulse rounded-sm bg-steel/15" />
          </div>
        ))}
      </nav>
    );
  }
  const noGuild = !!me && !me.guild; // signed in, no guild: Guest-equivalent menu + Guild Management
  const isDev = !!me?.user.is_developer;
  const base = noGuild ? NO_GUILD_NAV_ITEMS : NAV_ITEMS;
  const items = isDev ? [...base, ...DEV_NAV_ITEMS] : base;
  return (
    <nav aria-label={t("Main")} className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isNavActive(pathname, href);
        return (
          <Fragment key={href}>
          {isDev && href === DEV_NAV_ITEMS[0].href && (
            <p className="mt-4 mb-1 border-t border-gold/25 px-3 pt-4 font-heading text-3xs font-semibold tracking-[0.3em] text-gold-text uppercase">{t("Developer")}</p>
          )}
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 border border-transparent px-3 py-2.5 text-sm transition-colors outline-none",
              "focus-visible:border-arcane/50 focus-visible:bg-arcane/5",
              active
                ? "border-arcane/30 bg-[image:var(--active-gradient)] font-medium text-brand-strong"
                : "text-steel hover:border-steel/10 hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {/* Active gem marker */}
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 -left-px h-6 w-[3px] -translate-y-1/2 rounded-full transition-colors",
                active
                  ? "bg-[image:var(--gold-fill)] shadow-[0_0_10px_var(--gold-glow)]"
                  : "bg-transparent",
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-arcane" : "text-subtle group-hover:text-arcane",
              )}
            />
            <span className="tracking-wide">{t(label)}</span>
          </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
