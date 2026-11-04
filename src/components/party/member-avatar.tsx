"use client";

import { useState } from "react";
import { ClassImage } from "@/components/aion/class-image";
import { classImageSrc } from "@/lib/aion/class-images";

interface Props {
  /** Portrait URL returned by the AION2 API (roster `profile_image`). */
  src: string | null;
  name: string;
  className: string | null;
  size: number;
}

/**
 * Character portrait for a party slot — same source and frame style as the
 * member profile view. Falls back to the class emblem, then the name initial,
 * when the API gave no image or it fails to load.
 */
export function MemberAvatar({ src, name, className, size }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPortrait = !!src && failedSrc !== src;
  return (
    <span
      data-testid="slot-avatar"
      className="relative flex shrink-0 items-center justify-center overflow-hidden border border-brand-muted/40 bg-icon-well"
      style={{ width: size, height: size }}
    >
      {showPortrait ? (
        // eslint-disable-next-line @next/next/no-img-element -- portrait URL returned by the AION2 API
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className="size-full object-cover"
        />
      ) : classImageSrc(className) ? (
        <ClassImage name={className} className="size-3/4 opacity-80" />
      ) : (
        <span aria-hidden className="text-xs font-bold text-subtle">{name.charAt(0)}</span>
      )}
    </span>
  );
}
