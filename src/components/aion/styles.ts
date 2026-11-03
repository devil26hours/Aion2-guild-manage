import { cn } from "@/lib/utils";

/** Shared AION class strings for form controls and buttons inside the app shell. */

export const aionField = cn(
  "h-9 rounded-none border-steel/20 bg-ink/70 text-sm text-foreground dark:bg-ink/70",
  "placeholder:text-steel/40 transition-[border-color,box-shadow] hover:border-gold-dim/50",
  "focus-visible:border-gold/60 focus-visible:ring-2 focus-visible:ring-arcane/25",
);

export const aionButtonPrimary = cn(
  "h-9 rounded-none border border-gold/70 px-3.5",
  "bg-gradient-to-b from-[#d8b56c] via-[#b8924a] to-[#86692f] text-[#140f05]",
  "font-heading text-xs font-bold tracking-[0.16em] uppercase",
  "shadow-[inset_0_1px_0_rgba(255,240,205,0.55),0_6px_18px_-10px_rgba(201,164,92,0.8)]",
  "hover:bg-gradient-to-b hover:brightness-110 focus-visible:ring-arcane/50",
);

export const aionButtonSecondary = cn(
  "h-9 rounded-none border border-steel/20 bg-ink/60 px-3 text-xs tracking-wider text-steel",
  "hover:border-gold-dim/60 hover:bg-gold/[0.05] hover:text-gold-bright",
  "dark:bg-ink/60 dark:hover:bg-gold/[0.05]",
);

export const aionButtonDanger = cn(
  "h-9 rounded-none border border-destructive/60 bg-destructive/20 px-3.5 text-xs font-semibold tracking-wider text-[#f6c2b6] uppercase",
  "hover:bg-destructive/35 focus-visible:ring-destructive/40",
);

export const aionDialog = cn(
  "rounded-none border-gold-dim/40 bg-gradient-to-b from-ink-raised to-ink",
  "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_50px_-30px_rgba(95,168,255,0.5)]",
);
