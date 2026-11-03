import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div>
        {eyebrow && (
          <p className="text-3xs font-semibold tracking-[0.3em] text-arcane/90 uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 font-heading text-2xl font-bold tracking-[0.08em] text-gold-bright sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-sm text-steel">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
