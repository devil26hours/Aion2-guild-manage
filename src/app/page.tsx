import type { Metadata } from "next";
import { SiteFooter } from "@/components/layout/site-footer";
import { WelcomeHero } from "@/components/welcome/welcome-hero";

export const metadata: Metadata = {
  title: "ChumChon AION2 — AION2 Player Community",
  description:
    "An independent community platform for AION 2 Global players. Look up any character and explore the interactive map with no account, or sign in for full guild management: roster, equipment inspection, combat power and dungeon parties.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "ChumChon AION2",
    url: "/",
    title: "ChumChon AION2 — AION2 Player Community",
    description: "Character lookup and an interactive map with no account, plus full guild management for AION 2 Global.",
    images: ["/image/logo/logo_png.png"],
  },
};

/**
 * Welcome page. The proxy only lets signed-out visitors (anonymous or GUEST) and signed-in
 * DEV accounts reach this route — every Member/Guild Leader is already redirected to
 * /dashboard (or /guild-setup/character-lookup) by src/proxy.ts before this renders.
 */
export default function Home() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[image:var(--app-sky)] supports-[height:100dvh]:h-dvh">
      <main className="min-h-0 flex-1 overflow-hidden">
        <WelcomeHero />
      </main>
      <div data-theme="dark" className="relative shrink-0">
        <SiteFooter className="mx-auto w-full max-w-3xl px-4 py-2 sm:px-6 [@media(max-height:700px)]:space-y-0 [@media(max-height:700px)]:py-1 [@media(max-height:700px)]:leading-snug" />
      </div>
    </div>
  );
}
