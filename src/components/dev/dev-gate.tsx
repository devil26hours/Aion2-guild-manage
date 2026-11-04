"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { SectionPanel } from "@/components/aion/section-panel";
import { useMe } from "@/lib/auth/me-store";
import { useT } from "@/lib/i18n";

/**
 * Wraps every /dev page. This only decides what to render: each DEV API and database
 * function checks the DEV role itself, so a bypassed gate exposes nothing.
 */
export function DevGate({ children }: { children: ReactNode }) {
  const t = useT();
  const { status, me } = useMe();
  if (status === "ready" && me?.user.is_developer) return <>{children}</>;
  if (status === "ready" || status === "error") {
    return (
      <div className="mx-auto max-w-xl">
        <SectionPanel title={t("Developer access required")} icon={ShieldAlert}>
          <p className="p-5 text-sm text-steel">{t("This area is only available to the project developer.")}</p>
        </SectionPanel>
      </div>
    );
  }
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-steel">
      <Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}
    </p>
  );
}
