import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OrnamentCorners } from "./ornaments";

/** Content panel with a gold frame, filigree corners and a ruled title bar. */
export function SectionPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "relative flex flex-col rounded-xl border border-gold/45 bg-[image:var(--panel-gradient)] shadow-panel",
        className,
      )}
    >
      {/* gold hairline */}
      <span aria-hidden className="pointer-events-none absolute inset-x-6 -top-px h-px bg-[image:var(--gold-rule)]" />

      <header className="relative flex items-start justify-between gap-3 rounded-t-xl bg-[image:var(--panel-header)] px-4 py-3.5 sm:px-5">
        {/* gold section divider */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[image:var(--gold-fade)]" />
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-gold" />}
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold tracking-[0.14em] text-brand-strong uppercase">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-subtle">{description}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className={cn("flex-1 p-4 sm:p-5", bodyClassName)}>{children}</div>
      <OrnamentCorners small />
    </section>
  );
}
