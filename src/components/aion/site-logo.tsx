import Image from "next/image";
import { cn } from "@/lib/utils";
import logo from "../../../public/image/logo/logo_png.png";

/** The site's primary logo (public/image/logo/logo_png.png). Size it with a height class; width follows the aspect ratio. */
export function SiteLogo({ className, preload = false }: { className?: string; preload?: boolean }) {
  return <Image src={logo} alt="AION 2" preload={preload} className={cn("w-auto object-contain", className)} />;
}
