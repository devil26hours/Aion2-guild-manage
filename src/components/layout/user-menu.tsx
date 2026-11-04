"use client";


import { useT } from "@/lib/i18n";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
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

export function UserMenu() {
  const t = useT();
  const { status, me } = useMe();
  const ready = status === "ready" && !!me;
  // The signed-in account: its character name (or email) and its role in the guild.
  const display = me?.user.character?.name ?? me?.user.email ?? "";
  const roleLabel = me?.guild?.role === "leader" ? t("Guild Leader") : t("Guild Member");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-2.5 border border-transparent py-1 pr-1.5 pl-1 transition-colors outline-none hover:border-steel/15 hover:bg-surface-hover focus-visible:border-arcane/50 data-[state=open]:border-brand-muted/40">
        <span className="flex size-8 items-center justify-center border border-gold/60 bg-gradient-to-b from-brand/30 to-brand/10 font-heading text-sm font-bold text-brand-strong">
          {ready ? display.charAt(0).toUpperCase() : ""}
        </span>
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
          <p className="text-sm text-foreground" data-testid="user-menu-name">{display}</p>
          <p className="truncate text-xs text-subtle">{me?.user.email}</p>
          <p className="mt-0.5 text-3xs tracking-wider text-gold-text uppercase" data-testid="user-menu-role">{roleLabel}</p>
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
