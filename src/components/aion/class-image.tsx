import Image from "next/image";
import { classImageSrc } from "@/lib/aion/class-images";
import { cn } from "@/lib/utils";

/**
 * Class emblem from `public/image/class-pic/`. Decorative by default (the
 * class name is always shown as text next to it). Renders nothing when no
 * image exists for the class name.
 */
export function ClassImage({ name, className, alt = "" }: { name: string | null | undefined; className?: string; alt?: string }) {
  const src = classImageSrc(name);
  if (!src) return null;
  return (
    <Image
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={64}
      height={64}
      draggable={false}
      className={cn("shrink-0 object-contain select-none", className)}
    />
  );
}
