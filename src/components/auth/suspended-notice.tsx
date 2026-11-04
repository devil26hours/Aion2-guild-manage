"use client";

import { LogOut, ShieldAlert } from "lucide-react";
import { aionButtonPrimary } from "@/components/aion/styles";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/client";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SuspendedNotice() {
  const t = useT();
  return (
    <div className="space-y-4 text-center">
      <ShieldAlert aria-hidden className="mx-auto size-10 text-danger-text" />
      <p className="text-sm text-steel">{t("A developer suspended this account. If you think this is a mistake, contact the ChumChon AION2 team.")}</p>
      <Button type="button" onClick={() => void logout()} className={cn(aionButtonPrimary, "h-10 w-full")}>
        <LogOut aria-hidden /> {t("Log out")}
      </Button>
    </div>
  );
}
