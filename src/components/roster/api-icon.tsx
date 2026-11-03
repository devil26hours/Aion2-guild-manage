"use client";

import { useState } from "react";
import { gradeColor } from "@/lib/roster/profile-view";

/** Remote icon from the API response, with a lettered fallback when it fails or is absent. */
export function ApiIcon({ src, alt, size = 40, color }: { src: string | null; alt: string; size?: number; color?: string }) {
  const [ok, setOk] = useState(true);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden border bg-[#0a0e18]"
      style={{ width: size, height: size, borderColor: color ? `${color}99` : "rgba(147,162,187,0.25)", boxShadow: color ? `inset 0 0 10px ${color}33` : undefined }}
    >
      {src && ok ? (
        // eslint-disable-next-line @next/next/no-img-element -- icon URL returned by the AION2 API
        <img src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" onError={() => setOk(false)} className="size-full object-contain" />
      ) : (
        <span aria-hidden className="text-xs font-bold text-steel/60">{alt.charAt(0)}</span>
      )}
    </span>
  );
}

export function GradeLabel({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const c = gradeColor(grade);
  return (
    <span className="border px-1 text-5xs font-semibold tracking-[0.12em] uppercase" style={{ color: c, borderColor: `${c}55`, backgroundColor: `${c}14` }}>
      {grade}
    </span>
  );
}
