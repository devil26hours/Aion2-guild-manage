import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OrnamentCorner } from "./ornaments";

/** Dark metallic-bordered panel with gold filigree corners. */
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
        "relative border border-gold-dim/40 bg-gradient-to-b from-ink-raised/95 to-ink/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9),0_0_60px_-30px_rgba(95,168,255,0.45)]",
        className,
      )}
    >
      {/* Inner hairline frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[5px] border border-steel/10"
      />
      {/* Top highlight sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-gold-bright/70 to-transparent"
      />
      <OrnamentCorner corner="tl" />
      <OrnamentCorner corner="tr" />
      <OrnamentCorner corner="bl" />
      <OrnamentCorner corner="br" />
      <div className="relative">{children}</div>
    </div>
  );
}
