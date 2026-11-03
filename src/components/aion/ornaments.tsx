import { cn } from "@/lib/utils";

/** Horizontal gold divider with a central diamond — used under headings. */
export function OrnamentDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("flex items-center justify-center gap-3", className)}
    >
      <span className="h-px w-16 bg-gradient-to-r from-transparent via-gold-dim/70 to-gold/80 sm:w-24" />
      <svg viewBox="0 0 24 12" className="h-3 w-6 text-gold">
        <path d="M0 6h6" stroke="currentColor" strokeWidth="0.75" />
        <path d="M18 6h6" stroke="currentColor" strokeWidth="0.75" />
        <path
          d="M12 1 17 6 12 11 7 6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
        />
        <path d="M12 4 14 6 12 8 10 6Z" fill="currentColor" />
      </svg>
      <span className="h-px w-16 bg-gradient-to-l from-transparent via-gold-dim/70 to-gold/80 sm:w-24" />
    </div>
  );
}

type Corner = "tl" | "tr" | "bl" | "br";

const cornerTransform: Record<Corner, string> = {
  tl: "",
  tr: "-scale-x-100",
  bl: "-scale-y-100",
  br: "-scale-100",
};

const cornerPosition: Record<Corner, string> = {
  tl: "-top-px -left-px",
  tr: "-top-px -right-px",
  bl: "-bottom-px -left-px",
  br: "-bottom-px -right-px",
};

/** Filigree corner bracket for framed panels. */
export function OrnamentCorner({ corner }: { corner: Corner }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      className={cn(
        "pointer-events-none absolute size-9 text-gold sm:size-10",
        cornerPosition[corner],
        cornerTransform[corner],
      )}
    >
      <path
        d="M1 22V1h21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 14V5h9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="0.75"
      />
      <path d="M1 1 7 7" stroke="currentColor" strokeWidth="0.75" />
      <path d="M7 4.5 9.5 7 7 9.5 4.5 7Z" fill="currentColor" />
      <circle cx="26" cy="1" r="1.2" fill="currentColor" />
      <circle cx="1" cy="26" r="1.2" fill="currentColor" />
    </svg>
  );
}

/** Winged crest emblem used as the brand mark. */
export function AionCrest({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 64"
      className={cn("text-gold", className)}
      fill="none"
    >
      <defs>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1dfb4" />
          <stop offset="0.55" stopColor="#c9a45c" />
          <stop offset="1" stopColor="#7d6634" />
        </linearGradient>
        <radialGradient id="crest-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#cfe6ff" />
          <stop offset="0.45" stopColor="#5fa8ff" />
          <stop offset="1" stopColor="#5fa8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Left wing */}
      <g stroke="url(#crest-gold)" strokeWidth="1.1" strokeLinecap="round">
        <path d="M52 34C40 30 26 22 8 10c8 12 18 20 30 26" />
        <path d="M52 38C40 36 26 32 12 24c8 9 18 14 30 17" />
        <path d="M52 42C42 42 30 40 18 36c8 6 18 9 28 9" />
      </g>
      {/* Right wing */}
      <g stroke="url(#crest-gold)" strokeWidth="1.1" strokeLinecap="round">
        <path d="M68 34c12-4 26-12 44-24-8 12-18 20-30 26" />
        <path d="M68 38c12-2 26-6 40-14-8 9-18 14-30 17" />
        <path d="M68 42c10 0 22-2 34-6-8 6-18 9-28 9" />
      </g>
      {/* Central lozenge */}
      <path
        d="M60 12 70 34 60 58 50 34Z"
        stroke="url(#crest-gold)"
        strokeWidth="1.4"
        fill="#0b101b"
      />
      <path
        d="M60 20 65.5 34 60 49 54.5 34Z"
        stroke="url(#crest-gold)"
        strokeWidth="0.75"
        strokeOpacity="0.7"
      />
      <circle cx="60" cy="34" r="9" fill="url(#crest-core)" opacity="0.85" />
      <circle cx="60" cy="34" r="2.2" fill="#e8f3ff" />
      <path d="M60 4v6" stroke="url(#crest-gold)" strokeWidth="1" />
      <circle cx="60" cy="3" r="1.4" fill="#e8d1a0" />
    </svg>
  );
}
