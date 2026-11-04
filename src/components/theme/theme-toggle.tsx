"use client";

import { Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n";
import { setTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Sun / moon button. The icons follow the CSS variant, so they are right before hydration. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const theme = useTheme();
  const label = theme === "dark" ? t("Switch to light mode") : t("Switch to dark mode");
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center border border-steel/20 bg-surface/60 text-steel transition-colors outline-none",
        "hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30",
        className,
      )}
    >
      <Moon aria-hidden className="size-4 page-dark:hidden" />
      <Sun aria-hidden className="hidden size-4 text-gold page-dark:block" />
    </button>
  );
}
