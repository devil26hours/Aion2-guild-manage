"use client";


import { useT } from "@/lib/i18n";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SiteLogo } from "@/components/aion/site-logo";
import { SidebarNav } from "./sidebar-nav";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export function MobileNav({ footer }: { footer?: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={t("Open navigation")}
        className="flex size-9 items-center justify-center border border-steel/15 text-steel transition-colors outline-none hover:border-gold-dim/60 hover:text-gold-bright focus-visible:border-arcane/60 lg:hidden"
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="gap-6 border-gold-dim/30 bg-gradient-to-b from-ink-raised to-ink p-4"
      >
        <div className="flex items-center gap-2 pt-1 pr-8">
          <SiteLogo className="h-9 shrink-0" />
          <div className="leading-none">
            <SheetTitle className="font-heading text-sm tracking-[0.18em] text-gold-bright">
              AION II
            </SheetTitle>
            <SheetDescription className="mt-1 text-[0.6rem] tracking-[0.3em] text-steel uppercase">
              {t("Guild Command")}</SheetDescription>
          </div>
        </div>
        <SidebarNav onNavigate={() => setOpen(false)} />
        <LanguageSwitcher className="self-start sm:hidden" />
        {footer && <div className="mt-auto">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
