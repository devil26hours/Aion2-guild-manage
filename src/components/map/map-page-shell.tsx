"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { GuestShell } from "@/components/layout/guest-shell";

/**
 * The Map is open to everyone (see OPEN_PAGES in src/proxy.ts), so the frame depends on who is looking:
 * a signed-in account gets the normal app frame (sidebar with the Map entry first), everyone else (guest, visitor
 * without a session, suspended account) gets the guest frame. The probe is a plain fetch on purpose: the shared
 * `call()` helper would redirect a 401 to /login, which is exactly what must not happen here.
 */
export function MapPageShell({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<"loading" | "member" | "guest">("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      // Only an account has a Supabase auth cookie (not HttpOnly). Without one there is nothing to ask the server: this
      // also keeps the guest's console free of a pointless 401.
      if (!document.cookie.split(";").some((c) => /^\s*sb-.*-auth-token/.test(c))) { if (!dead) setMode("guest"); return; }
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (!dead) setMode(r.ok ? "member" : "guest");
      } catch {
        if (!dead) setMode("guest");
      }
    })();
    return () => { dead = true; };
  }, []);
  if (mode === "loading") {
    return (
      <div className="grid min-h-dvh flex-1 place-items-center bg-[image:var(--app-sky)]" role="status" aria-label="Loading">
        <Loader2 className="size-6 animate-spin text-steel" />
      </div>
    );
  }
  return mode === "member" ? <AppShell>{children}</AppShell> : <GuestShell>{children}</GuestShell>;
}
