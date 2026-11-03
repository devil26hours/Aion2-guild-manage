"use client";


import { useT } from "@/lib/i18n";
import { Fragment, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "./nav-items";

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
  return (
    <nav aria-label={t("Main")} className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon, dev }, i) => {
        const active = pathname !== null && isNavActive(pathname, href);
        const firstDev = dev && !NAV_ITEMS[i - 1]?.dev;
        return (
          <Fragment key={href}>
          {firstDev && (
            <p className="mt-3 border-t border-steel/10 px-3 pt-3 font-heading text-4xs font-semibold tracking-[0.3em] text-steel/50 uppercase">
              {t("Developer")}</p>
          )}
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 border border-transparent px-3 py-2.5 text-sm transition-colors outline-none",
              "focus-visible:border-arcane/50 focus-visible:bg-arcane/5",
              active
                ? "border-gold-dim/40 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent text-gold-bright"
                : "text-steel hover:border-steel/10 hover:bg-white/[0.03] hover:text-foreground",
            )}
          >
            {/* Active gem marker */}
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 -left-px h-6 w-0.5 -translate-y-1/2 transition-colors",
                active
                  ? "bg-gold shadow-[0_0_10px_rgba(201,164,92,0.8)]"
                  : "bg-transparent",
              )}
            />
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-gold" : "text-steel/70 group-hover:text-gold/80",
              )}
            />
            <span className="tracking-wide">{t(label)}</span>
            {dev && <span className="ml-auto border border-steel/20 px-1 text-5xs font-semibold tracking-wider text-steel/60 uppercase">Dev</span>}
          </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
