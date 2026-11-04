import type { CSSProperties } from "react";
import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";
import loginBg from "../../../public/image/background-pic/login_bg.png";

/** Deterministic golden-ratio scatter (no Math.random) so server and client markup match during hydration. */
const SPARKLES = Array.from({ length: 48 }, (_, i) => ({
  left: `${(((i + 1) * 61.8034) % 100).toFixed(2)}%`,
  top: `${(((i + 1) * 75.4878) % 100).toFixed(2)}%`,
  size: 10 + ((i * 7) % 5) * 6,
  duration: `${3 + ((i * 13) % 40) / 10}s`,
  delay: `${-((i * 1.3) % 7).toFixed(1)}s`,
  peak: 0.55 + ((i * 3) % 5) * 0.1,
}));

const MOTES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(((i + 1) * 38.1966) % 100).toFixed(2)}%`,
  top: `${40 + ((i * 17) % 60)}%`,
  size: 2 + (i % 3),
  duration: `${10 + ((i * 7) % 10)}s`,
  delay: `${-((i * 1.9) % 18).toFixed(1)}s`,
  drift: `${(i % 2 === 0 ? 1 : -1) * (10 + ((i * 11) % 24))}px`,
  peak: 0.5 + (i % 4) * 0.15,
}));

/**
 * Full-screen photo with twinkling and rising gold light. By default this is the sign-in
 * pages' version, which looks the same in both themes; the app frame passes its own
 * photo, scrim and a smaller particle count.
 */
export function PhotoBackdrop({
  src = loginBg,
  scrimClassName = "bg-[linear-gradient(180deg,rgba(5,8,15,0.55)_0%,rgba(5,8,15,0.2)_40%,rgba(5,8,15,0.35)_70%,rgba(5,8,15,0.8)_100%)]",
  moteCount = MOTES.length,
  sparkleCount = SPARKLES.length,
}: {
  src?: StaticImageData;
  scrimClassName?: string;
  moteCount?: number;
  sparkleCount?: number;
}) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-[#05080f]">
      {/* object-cover on a portrait screen scales to the height, so the width needed follows the 16:9 photo */}
      <Image src={src} alt="" fill preload placeholder="blur" sizes="max(100vw, 178vh)" className="object-cover" />

      {/* Scrim: keeps the text that sits directly on the page readable over the photo */}
      <div className={cn("absolute inset-0", scrimClassName)} />

      {MOTES.slice(0, moteCount).map((m, i) => (
        <span
          key={i}
          className="aion-mote absolute rounded-full"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              background: "#ffe6a6",
              boxShadow: `0 0 ${m.size * 4}px rgba(240, 190, 80, 0.8)`,
              "--mote-duration": m.duration,
              "--mote-delay": m.delay,
              "--mote-drift": m.drift,
              "--mote-peak": m.peak,
            } as CSSProperties
          }
        />
      ))}

      {SPARKLES.slice(0, sparkleCount).map((s, i) => (
        <span
          key={i}
          className={cn("aion-sparkle absolute", i % 2 === 1 && "hidden sm:block")}
          style={
            {
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              "--sparkle-duration": s.duration,
              "--sparkle-delay": s.delay,
              "--sparkle-peak": s.peak,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
