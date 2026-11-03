import Link from "next/link";
import { ArrowLeft, Hammer, type LucideIcon } from "lucide-react";
import { FramedPanel } from "@/components/aion/framed-panel";
import { OrnamentDivider } from "@/components/aion/ornaments";
import { PageHeader } from "./page-header";

/** Temporary "under construction" page for routes not yet built. */
export function PlaceholderPage({
  title,
  description,
  icon: Icon = Hammer,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <>
      <PageHeader eyebrow="Guild Command" title={title} description={description} />
      <FramedPanel className="mx-auto max-w-lg px-6 py-10 text-center">
        <span className="mx-auto flex size-12 items-center justify-center border border-gold-dim/50 bg-gold/10 text-gold">
          <Icon className="size-5" />
        </span>
        <h2 className="mt-4 font-heading text-lg tracking-[0.12em] text-foreground">
          Under Construction
        </h2>
        <OrnamentDivider className="mt-3" />
        <p className="mt-4 text-sm text-steel">
          This section is being forged and will arrive in a later update.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 text-xs tracking-[0.2em] text-gold uppercase underline-offset-4 hover:text-gold-bright hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to dashboard
        </Link>
      </FramedPanel>
    </>
  );
}
