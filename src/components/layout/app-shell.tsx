import type { ReactNode } from "react";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import mainBg from "../../../public/image/background-pic/main_bg.png";
import { AppHeader } from "./app-header";
import { FooterBar } from "./site-footer";
import { SidebarGuildCard } from "./sidebar-guild-card";
import { SidebarNav } from "./sidebar-nav";

/** Authenticated application frame: header + responsive sidebar. */
export function AppShell({ children }: { children: ReactNode }) {
  const guildCard = <SidebarGuildCard />;

  return (
    <div className="aion-app-frame relative flex min-h-dvh flex-1 flex-col bg-[image:var(--app-sky)][--footer-bar-h:6.5rem] sm:[--footer-bar-h:4rem]">
      {/* Page headings sit directly on the photo, so the scrim follows the theme: pale under dark ink, dark under light ink. */}
      <PhotoBackdrop
        src={mainBg}
        scrimClassName="bg-[linear-gradient(rgba(240,245,252,0.82),rgba(240,245,252,0.82))] dark:bg-[linear-gradient(180deg,rgba(5,8,15,0.7)_0%,rgba(5,8,15,0.6)_25%,rgba(5,8,15,0.45)_55%,rgba(5,8,15,0.55)_100%)]"
        moteCount={12}
        sparkleCount={24}
      />

      <div
        aria-hidden
        className="aion-grain pointer-events-none fixed inset-0 opacity-[var(--grain-opacity)] mix-blend-overlay"
      />

      <AppHeader mobileNavFooter={guildCard} />

      <div className="relative flex flex-1">
        {/* Footer is a fixed, full-width bar, so the sidebar's height is shortened by
            --footer-bar-h to stop right at its top edge instead of running behind it. */}
        <aside className="sticky top-[65px] hidden h-[calc(100dvh-65px-var(--footer-bar-h))] w-60 shrink-0 flex-col gap-6 border-r border-steel/10 bg-[var(--sidebar-bg)] px-3 py-5 lg:flex">
          <p className="shrink-0 px-3 font-heading text-3xs font-semibold tracking-[0.3em] text-gold-text uppercase">
            Command
          </p>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1" data-testid="sidebar-scroll">
            <SidebarNav />
          </div>
          <div className="shrink-0">{guildCard}</div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pt-6 pb-[calc(var(--footer-bar-h)+1.5rem)] sm:px-6 lg:px-8 lg:pt-8 lg:pb-[calc(var(--footer-bar-h)+2rem)]">
          {children}
        </main>
      </div>

      <FooterBar />
    </div>
  );
}
