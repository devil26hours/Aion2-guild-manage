"use client";

import Link from "next/link";
import { Gauge, Map as MapIcon } from "lucide-react";
import { ClassImage } from "@/components/aion/class-image";
import { OrnamentDivider } from "@/components/aion/ornaments";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { SiteLogo } from "@/components/aion/site-logo";
import { aionButtonPrimary, aionButtonSecondary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { CharacterLookupCta } from "@/components/welcome/character-lookup-cta";
import { AION_CLASSES, CLASS_META } from "@/lib/aion/classes";
import { useIsDeveloper } from "@/lib/auth/me-store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Hero: the official site logo (same `SiteLogo` the Login page uses), a short headline and
 * description, the two no-login CTAs, and a decorative strip of the game's 8 real classes
 * (src/lib/aion/classes.ts — their actual names/roles/colours, not fabricated content). This is
 * the whole Welcome page and must fit one viewport without scrolling, so gaps scale with the
 * viewport height and sizes step down on short screens.
 */
export function WelcomeHero() {
  const t = useT();
  const isDev = useIsDeveloper();
  return (
    <section data-theme="dark" className="relative isolate flex h-full flex-col items-center justify-center overflow-hidden px-4 py-[clamp(0.25rem,2dvh,3rem)] sm:px-6">
      <PhotoBackdrop moteCount={14} sparkleCount={26} />
      <div className="aion-enter relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        <SiteLogo preload className="h-[clamp(2.25rem,calc(20dvh-5.5rem),5rem)] sm:h-[clamp(2.25rem,calc(20dvh-3.5rem),7rem)]" />
        <h1 className="mt-1 font-display leading-none [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]">
          <span className="block bg-[image:var(--wordmark)] bg-clip-text text-[clamp(1.5rem,6dvh,3rem)] font-bold tracking-[0.18em] text-transparent drop-shadow-[var(--wordmark-shadow)] sm:text-[clamp(1.5rem,7.5dvh,3.75rem)]">
            ChumChon
          </span>
          <span className="mt-2 block text-base font-semibold tracking-[0.5em] text-gold-text sm:text-lg [@media(max-height:600px)]:mt-0.5">AION2</span>
        </h1>
        <OrnamentDivider className="mt-[clamp(0.125rem,1.8dvh,1.25rem)] [@media(max-height:480px)]:hidden" />

        <p className="mt-[clamp(0.125rem,1.8dvh,1.25rem)] font-heading text-lg font-semibold tracking-wide text-brand-strong [text-shadow:0_1px_4px_rgba(0,0,0,0.9)] sm:text-xl">
          {t("Lookup. Explore. Lead Your Guild.")}
        </p>
        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-foreground/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:text-base [@media(max-height:600px)]:mt-1 [@media(max-height:600px)]:text-xs [@media(max-height:600px)]:leading-snug">
          {t(
            "An independent community platform for AION2 Global — character tools for every player, plus full guild management for your team.",
          )}
        </p>

        <div className="mt-[clamp(0.25rem,2.5dvh,1.75rem)] flex flex-wrap items-center justify-center gap-3">
          <CharacterLookupCta
            label={t("Character Lookup")}
            className={cn(aionButtonPrimary, "h-11 px-5 text-sm shadow-[0_0_24px_-6px_var(--gold-glow)] transition-transform hover:-translate-y-0.5 [@media(max-height:600px)]:h-9")}
          />
          <Button
            asChild
            variant="outline"
            className={cn(aionButtonSecondary, "h-11 border-steel/30 bg-surface/20 px-5 text-sm text-foreground backdrop-blur-sm transition-transform hover:-translate-y-0.5 hover:bg-surface/30 [@media(max-height:600px)]:h-9")}
          >
            <Link href="/map">
              <MapIcon className="size-4 transition-transform group-hover/button:rotate-6" /> {t("Explore Map")}
            </Link>
          </Button>
        </div>

        <div className="mt-[clamp(0.125rem,1.8dvh,1.25rem)] text-xs text-steel [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
          {isDev ? (
            <Button asChild variant="ghost" className="h-auto gap-1.5 p-0 text-xs font-semibold text-gold-text underline-offset-4 hover:underline">
              <Link href="/dev/overview">
                <Gauge className="size-3.5" /> {t("Open System Overview")}
              </Link>
            </Button>
          ) : (
            <>
              {t("Want to manage your guild?")}{" "}
              <Link href="/login" className="font-semibold text-gold-text underline-offset-4 hover:underline">
                {t("Login")}
              </Link>{" "}
              {t("or")}{" "}
              <Link href="/register" className="font-semibold text-gold-text underline-offset-4 hover:underline">
                {t("Create Account")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Real game classes (name, role and brand colour from src/lib/aion/classes.ts) — thematic, not decorative filler. */}
      <div className="relative z-10 mt-[clamp(0.25rem,3dvh,2.5rem)]">
        <p className="text-center text-3xs font-semibold tracking-[0.3em] text-gold-text/80 uppercase [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
          {t("8 Classes. One Community.")}
        </p>
        <div className="mx-auto mt-[clamp(0.25rem,1.5dvh,1rem)] flex max-w-2xl flex-wrap items-start justify-center gap-3 sm:gap-4 [@media(max-height:760px)]:flex-nowrap [@media(max-height:760px)]:gap-1 sm:[@media(max-height:760px)]:gap-3">
          {AION_CLASSES.map((cls) => {
            const meta = CLASS_META[cls];
            return (
              <div key={cls} className="group flex flex-col items-center gap-1.5">
                <span
                  className="flex items-center justify-center rounded-full border-2 bg-surface/25 backdrop-blur-sm transition-transform duration-300 group-hover:-translate-y-1.5 size-14 p-[clamp(0.25rem,1dvh,0.5rem)] sm:size-16 [@media(max-height:760px)]:size-[min(max(1.75rem,7.5dvh),calc((100vw-4rem)/8))]"
                  style={{ borderColor: meta.color, boxShadow: `0 0 14px -2px ${meta.color}` }}
                >
                  <ClassImage name={cls} className="size-full" />
                </span>
                <span className="text-4xs font-semibold tracking-wider text-foreground/0 uppercase [@media(max-height:760px)]:hidden transition-colors duration-200 group-hover:text-foreground/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                  {cls}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
