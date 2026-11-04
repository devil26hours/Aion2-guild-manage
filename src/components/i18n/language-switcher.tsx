"use client";

import { Languages } from "lucide-react";
import { setLocale, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LABELS: Record<Locale, { short: string; name: string }> = {
  en: { short: "EN", name: "English" },
  th: { short: "ไทย", name: "ภาษาไทย" },
};

/** EN | ไทย toggle. The preference is saved in this browser and restored on reload. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  return (
    <div role="radiogroup" aria-label="Language / ภาษา" data-testid="language-switcher" className={cn("flex h-9 items-center border border-steel/20 bg-surface/60", className)}>
      <Languages aria-hidden className="ml-2 size-3.5 text-subtle" />
      {(Object.keys(LABELS) as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          title={LABELS[l].name}
          data-locale={l}
          onClick={() => setLocale(l)}
          className={cn(
            "h-full px-2 text-xs font-semibold tracking-wider transition-colors outline-none focus-visible:bg-arcane/15",
            locale === l ? "font-bold text-brand" : "text-subtle hover:text-foreground",
          )}
        >
          {LABELS[l].short}
        </button>
      ))}
    </div>
  );
}
