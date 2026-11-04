"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { GUEST_NAV_ITEMS, isNavActive } from "./nav-items";

/** Menu strip of the guest frame: the Interactive Map is always first. Active state streams in behind Suspense like the sidebar. */
export function GuestNav() {
  return (
    <Suspense fallback={<List pathname={null} />}>
      <Active />
    </Suspense>
  );
}

function Active() {
  return <List pathname={usePathname()} />;
}

function List({ pathname }: { pathname: string | null }) {
  const t = useT();
  return (
    <nav aria-label={t("Main")} className="flex gap-1 overflow-x-auto border-t border-steel/10 px-4 py-1.5 sm:px-6" data-testid="guest-nav">
      {GUEST_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border border-transparent px-3 py-1.5 text-xs tracking-wide transition-colors outline-none focus-visible:border-arcane/50",
              active ? "border-arcane/30 bg-[image:var(--active-gradient)] font-medium text-brand-strong" : "text-steel hover:border-steel/10 hover:bg-surface-hover hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-arcane" : "text-subtle")} />
            {t(label)}
          </Link>
        );
      })}
    </nav>
  );
}
