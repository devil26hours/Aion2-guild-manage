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
        className="flex size-9 items-center justify-center border border-steel/15 text-steel transition-colors outline-none hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 lg:hidden"
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="gap-6 border-gold/35 bg-[image:var(--panel-gradient)] p-4"
      >
        <div className="flex items-center gap-2 pt-1 pr-8">
          <SiteLogo className="h-9 shrink-0" />
          <div className="leading-none">
            <SheetTitle className="font-display text-sm font-bold tracking-[0.18em] text-brand-strong">
              ChumChon AION2
            </SheetTitle>
            <SheetDescription className="mt-1 text-4xs tracking-[0.12em] text-steel">
              {t("AION2 Player Community")}</SheetDescription>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain" data-testid="mobile-nav-scroll">
          <SidebarNav onNavigate={() => setOpen(false)} />
          <LanguageSwitcher className="self-start sm:hidden" />
        </div>
        {footer && <div className="shrink-0">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
