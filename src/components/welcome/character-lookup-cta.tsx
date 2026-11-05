"use client";

import Link from "next/link";
import { Loader2, ScanSearch } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { continueAsGuest } from "@/lib/auth/client";
import { useIsDeveloper } from "@/lib/auth/me-store";
import { useT } from "@/lib/i18n";

/**
 * "Character Lookup" CTA for the Welcome page. A signed-out visitor has no GUEST cookie yet,
 * so a plain link to /character-lookup would bounce through /login first; this starts a GUEST
 * session (same `continueAsGuest()` the login page's "Continue as Guest" button uses) and then
 * navigates there, so the very first click works with no extra redirect. A DEV account already
 * has a real session, so it just links straight to the page.
 */
export function CharacterLookupCta({ label, className }: { label: string; className?: string }) {
  const t = useT();
  const isDev = useIsDeveloper();
  const [busy, setBusy] = useState(false);

  if (isDev) {
    return (
      <Button asChild className={className}>
        <Link href="/character-lookup">
          <ScanSearch className="size-4" /> {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      disabled={busy}
      data-testid="welcome-guest-lookup"
      onClick={() => {
        setBusy(true);
        void continueAsGuest("/character-lookup");
      }}
      className={className}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
      {busy ? t("Starting…") : label}
    </Button>
  );
}
