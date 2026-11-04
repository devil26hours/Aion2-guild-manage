import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OrnamentCorners } from "./ornaments";

/** Bordered feature panel with gold filigree corners. */
export function FramedPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-gold/45 bg-[image:var(--panel-gradient)] shadow-frame",
        className,
      )}
    >
      {/* Inner hairline frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[5px] rounded-lg border border-steel/10"
      />
      {/* Top highlight sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[image:var(--gold-rule)]"
      />
      <OrnamentCorners />
      <div className="relative">{children}</div>
    </div>
  );
}
