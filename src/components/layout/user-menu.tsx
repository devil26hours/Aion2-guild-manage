"use client";


import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/auth/client";
import { useMe } from "@/lib/auth/me-store";
import { cn } from "@/lib/utils";

/** Avatar shown in both the header trigger and the dropdown header: the account's own character portrait (AION2 API `profile_image`), falling back to a name-initial monogram when there is none or it fails to load. */
function UserAvatar({ src, label, className }: { src: string | null; label: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPortrait = !!src && failed !== src;
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-gold/60 bg-gradient-to-b from-brand/30 to-brand/10 font-heading font-bold text-brand-strong", className)}>
      {showPortrait ? (
        // eslint-disable-next-line @next/next/no-img-element -- portrait URL returned by the AION2 API
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(src)} className="size-full object-cover" />
      ) : (
        label.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export function UserMenu() {
  const t = useT();
  const { status, me } = useMe();
  const ready = status === "ready" && !!me;
  // The signed-in account: its character name (or email) and its role in the guild.
  const display = me?.user.character?.name ?? me?.user.email ?? "";
  const portrait = me?.user.character?.profile_image ?? null;
  const roleLabel = !me?.guild ? t("No Guild") : me.guild.role === "leader" ? t("Guild Leader") : t("Guild Member");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-2.5 border border-transparent py-1 pr-1.5 pl-1 transition-colors outline-none hover:border-steel/15 hover:bg-surface-hover focus-visible:border-arcane/50 data-[state=open]:border-brand-muted/40">
        <UserAvatar src={ready ? portrait : null} label={ready ? display : ""} className="size-8 text-sm" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block min-w-16 text-sm text-foreground">{ready ? display : "\u00a0"}</span>
          <span className="block text-3xs tracking-wider text-gold-text uppercase">
            {ready ? roleLabel : "\u00a0"}
          </span>
        </span>
        <ChevronDown className="size-3.5 text-subtle transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-md border-gold/35 bg-surface-raised shadow-float"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2.5">
            <UserAvatar src={ready ? portrait : null} label={ready ? display : ""} className="size-9 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground" data-testid="user-menu-name">{display}</p>
              <p className="truncate text-xs text-subtle">{me?.user.email}</p>
              <p className="mt-0.5 text-3xs tracking-wider text-gold-text uppercase" data-testid="user-menu-role">{roleLabel}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-md">
          <Link href="/settings">
            <UserRound />
            {t("Profile")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="rounded-md">
          <Link href="/settings">
            <Settings />
            {t("Settings")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="rounded-md" onSelect={() => void logout()}>
          <LogOut />
          {t("Log out")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
