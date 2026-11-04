import type { ReactNode } from "react";
import { GuestShell } from "@/components/layout/guest-shell";

/**
 * Frame for GUEST sessions. No sidebar, top navigation, user menu or any other app link.
 * The proxy rewrites /character-lookup to this route for guests only; any other request for
 * /guest-lookup is redirected, so it can't be opened directly.
 */
export default function GuestLayout({ children }: { children: ReactNode }) {
  return <GuestShell>{children}</GuestShell>;
}
