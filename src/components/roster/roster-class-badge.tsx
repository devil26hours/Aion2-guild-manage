"use client";

import { useT } from "@/lib/i18n";
import { ClassBadge } from "@/components/aion/class-badge";
import { ClassImage } from "@/components/aion/class-image";
import { classImageSrc } from "@/lib/aion/class-images";
import { knownClass } from "@/lib/roster/party-adapter";
import { cn } from "@/lib/utils";

/**
 * Class display for real API data: uses the existing ClassBadge (color/icon)
 * when the API class name matches a known class, else shows the raw name
 * (with the class emblem when one exists for it, e.g. "Elementalist").
 */
export function RosterClassBadge({
  className: name,
  withIcon = false,
  wrapperClassName,
}: {
  className: string | null;
  withIcon?: boolean;
  wrapperClassName?: string;
}) {
  const t = useT();
  const cls = knownClass(name);
  if (cls) return <ClassBadge cls={cls} withIcon={withIcon} className={wrapperClassName} />;
  return (
    <span className={cn("inline-flex items-center gap-2", wrapperClassName)}>
      {withIcon && classImageSrc(name) ? (
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center border border-steel/30 bg-steel/10">
          <ClassImage name={name} className="size-5" />
        </span>
      ) : (
        <span aria-hidden className="size-2 shrink-0 rotate-45 bg-steel/50" />
      )}
      <span className="text-foreground/90">{name ?? t("Unknown class")}</span>
    </span>
  );
}
