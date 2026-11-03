import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { SidebarGuildCard } from "./sidebar-guild-card";
import { SidebarNav } from "./sidebar-nav";

/** Authenticated application frame: header + responsive sidebar. */
export function AppShell({ children }: { children: ReactNode }) {
  const guildCard = <SidebarGuildCard />;

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col bg-[radial-gradient(ellipse_90%_50%_at_60%_-10%,#13213d_0%,#0a1020_45%,#070a11_100%)]">
      <div
        aria-hidden
        className="aion-grain pointer-events-none fixed inset-0 opacity-[0.035] mix-blend-overlay"
      />

      <AppHeader mobileNavFooter={guildCard} />

      <div className="relative flex flex-1">
        <aside className="sticky top-[65px] hidden h-[calc(100dvh-65px)] w-60 shrink-0 flex-col gap-6 border-r border-steel/10 bg-ink/50 px-3 py-5 lg:flex">
          <p className="px-3 font-heading text-3xs font-semibold tracking-[0.3em] text-gold/70 uppercase">
            Command
          </p>
          <SidebarNav />
          <div className="mt-auto">{guildCard}</div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
