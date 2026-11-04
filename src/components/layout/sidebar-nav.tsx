"use client";


import { useT } from "@/lib/i18n";
import { Suspense } from "react";
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
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isNavActive(pathname, href);
        return (
          <Link
            key={href}
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
        );
      })}
    </nav>
  );
}
