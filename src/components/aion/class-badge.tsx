import { CLASS_META, type AionClass } from "@/lib/aion/classes";
import { ClassImage } from "@/components/aion/class-image";
import { cn } from "@/lib/utils";

/**
 * Class name with its identity color as a marker (text stays neutral ink).
 * `withIcon` swaps the gem marker for the class emblem image.
 */
export function ClassBadge({
  cls,
  showRole = false,
  withIcon = false,
  className,
}: {
  cls: AionClass;
  showRole?: boolean;
  withIcon?: boolean;
  className?: string;
}) {
  const meta = CLASS_META[cls];
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {withIcon ? (
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center border"
          style={{
            color: meta.color,
            borderColor: `${meta.color}66`,
            backgroundColor: `${meta.color}1a`,
          }}
        >
          <ClassImage name={cls} className="size-5" />
        </span>
      ) : (
        <span
          aria-hidden
          className="size-2 shrink-0 rotate-45 ring-1 ring-foreground/20"
          style={{ backgroundColor: meta.color, boxShadow: `0 0 8px ${meta.color}80` }}
        />
      )}
      <span className="text-foreground/90">{meta.name}</span>
      {showRole && (
        <span className="text-2xs text-subtle">{meta.role}</span>
      )}
    </span>
  );
}
