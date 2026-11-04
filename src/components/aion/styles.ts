import { cn } from "@/lib/utils";

/** Shared AION class strings for form controls and buttons inside the app shell. */

export const aionField = cn(
  "h-9 rounded-md border-steel/25 bg-surface/80 text-sm text-foreground dark:bg-surface/70",
  "placeholder:text-subtle transition-[border-color,box-shadow] hover:border-brand-muted/70",
  "focus-visible:border-brand/70 focus-visible:ring-2 focus-visible:ring-arcane/25",
);

export const aionButtonPrimary = cn(
  "h-9 rounded-md border border-arcane/50 px-3.5",
  "bg-[image:var(--cta-gradient)] text-primary-foreground",
  "font-heading text-xs font-bold tracking-[0.16em] uppercase",
  "shadow-cta",
  "hover:brightness-110 focus-visible:ring-arcane/50",
);

export const aionButtonSecondary = cn(
  "h-9 rounded-md border border-steel/25 bg-surface/70 px-3 text-xs tracking-wider text-steel",
  "hover:border-gold/60 hover:bg-brand/[0.08] hover:text-brand-strong",
  "dark:bg-surface/60 dark:hover:bg-brand/[0.1]",
);

export const aionButtonDanger = cn(
  "h-9 rounded-md border border-destructive/60 bg-destructive/15 px-3.5 text-xs font-semibold tracking-wider text-danger-text uppercase",
  "hover:bg-destructive/35 focus-visible:ring-destructive/40",
);

export const aionDialog = cn(
  "rounded-xl border-gold/40 bg-[image:var(--panel-gradient)]",
  "shadow-dialog",
);
