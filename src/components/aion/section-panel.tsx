import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Content panel with a thin metallic frame and a gold-ruled title bar. */
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
        "relative flex flex-col border border-steel/12 bg-gradient-to-b from-ink-raised/90 to-ink/80 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      {/* corner ticks */}
      <span aria-hidden className="pointer-events-none absolute -top-px -left-px size-2.5 border-t border-l border-gold/70" />
      <span aria-hidden className="pointer-events-none absolute -top-px -right-px size-2.5 border-t border-r border-gold/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -left-px size-2.5 border-b border-l border-gold/40" />
      <span aria-hidden className="pointer-events-none absolute -right-px -bottom-px size-2.5 border-r border-b border-gold/40" />

      <header className="flex items-start justify-between gap-3 border-b border-steel/10 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-gold" />}
          <div className="min-w-0">
            <h2 className="font-heading text-sm font-semibold tracking-[0.14em] text-gold-bright uppercase">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-steel/75">{description}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className={cn("flex-1 p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
