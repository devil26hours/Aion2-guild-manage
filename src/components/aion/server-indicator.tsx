import { cn } from "@/lib/utils";

export function ServerIndicator({
  region = "Global",
  className,
}: {
  region?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 border border-steel/20 bg-ink/60 px-2.5 py-1 text-[0.65rem] font-medium tracking-[0.2em] text-steel uppercase backdrop-blur-sm",
        className,
      )}
    >
      <span className="aion-pip size-1.5 rounded-full bg-[#7ee79e]" />
      <span>
        Server <span className="text-gold-bright">{region}</span>
      </span>
    </div>
  );
}
