import type { CSSProperties } from "react";

/**
 * Deterministic mote layout (no Math.random) so server and client
 * markup match during hydration.
 */
const MOTES = Array.from({ length: 22 }, (_, i) => {
  const seed = (i * 37 + 11) % 100;
  return {
    left: `${(i * 4.6 + seed * 0.13) % 100}%`,
    top: `${55 + ((seed * 7) % 45)}%`,
    size: 1 + (i % 3),
    duration: `${14 + (seed % 12)}s`,
    delay: `${-((i * 1.7) % 18)}s`,
    drift: `${(i % 2 === 0 ? 1 : -1) * (8 + (seed % 22))}px`,
    peak: 0.35 + (i % 4) * 0.12,
    gold: i % 5 === 0,
  };
});

/** Full-screen layered CSS scene: sky glow, distant spires, haze, motes, grain. */
export function FantasyBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Base night sky */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,#13213d_0%,#0a1020_45%,#05070d_100%)]" />

      {/* Arcane rift glow behind panel */}
      <div className="absolute top-[18%] left-1/2 h-[60vmin] w-[90vmin] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(95,168,255,0.20),rgba(95,168,255,0.06)_55%,transparent)] blur-2xl" />
      <div className="absolute top-[8%] left-1/2 h-[30vmin] w-[50vmin] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(201,164,92,0.10),transparent)] blur-2xl" />

      {/* Distant floating-citadel silhouettes */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[42vh] w-full"
        viewBox="0 0 1440 400"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="bd-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#14203a" />
            <stop offset="1" stopColor="#0a0f1c" />
          </linearGradient>
          <linearGradient id="bd-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b1222" />
            <stop offset="1" stopColor="#05070d" />
          </linearGradient>
        </defs>
        <path
          fill="url(#bd-far)"
          opacity="0.75"
          d="M0 400V250l60-20 40 10 30-60 12-70 12 70 26 40 70-10 50 30 60-50 14-90 6-40 6 40 14 90 50 40 90-20 70 30 60-40 40 10 30-70 10-50 10 50 30 70 70 20 80-30 60 20 50-40 14-80 14 80 40 30 80 10 60-20 70 30V400Z"
        />
        <path
          fill="url(#bd-near)"
          d="M0 400V320l90-20 60 15 50-30 40 10 30-50 8-40 8 40 30 50 90 20 80-25 70 20 60-15 40-60 8-30 8 30 40 60 70 10 90-20 70 25 60-10 50-35 10-25 10 25 40 35 80 15 70-10 60 20V400Z"
        />
      </svg>

      {/* Low haze */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#05070d] via-[#05070d]/70 to-transparent" />

      {/* Motes */}
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="aion-mote absolute rounded-full"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              background: m.gold ? "#e8d1a0" : "#9fcbff",
              boxShadow: `0 0 ${m.size * 4}px ${m.gold ? "rgba(232,209,160,0.8)" : "rgba(95,168,255,0.9)"}`,
              "--mote-duration": m.duration,
              "--mote-delay": m.delay,
              "--mote-drift": m.drift,
              "--mote-peak": m.peak,
            } as CSSProperties
          }
        />
      ))}

      {/* Vignette + grain */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
      <div className="aion-grain absolute inset-0 opacity-[0.05] mix-blend-overlay" />
    </div>
  );
}
