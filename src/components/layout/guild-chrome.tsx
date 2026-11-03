"use client";


import { useT } from "@/lib/i18n";
import { LogOut, Shield } from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/auth/client";
import { guildImageUrl, useSettingsState } from "@/lib/settings/settings-store";
import { cn } from "@/lib/utils";

/**
 * Small client pieces of the app frame that read the SHARED guild settings
 * (Supabase via /api/settings). They render neutral placeholders until the
 * settings have loaded, so no default/demo values flash in.
 */

/** Guild emblem: the uploaded guild image, or the shield icon. */
export function GuildEmblem({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { status, settings } = useSettingsState();
  const url = status === "ready" ? guildImageUrl(settings) : null;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-gold-dim/50 bg-gold/10 text-gold", className)}>
      {url && failed !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- auth-protected API image, not a static asset
        <img src={url} alt="" data-testid="guild-emblem-img" onError={() => setFailed(url)} className="size-full object-cover" />
      ) : (
        <Shield className={cn("size-4", iconClassName)} />
      )}
    </span>
  );
}

export function GuildName() {
  const { status, settings } = useSettingsState();
  return <span data-testid="guild-name">{status === "ready" ? settings.guild.name : " "}</span>;
}

/** Guild server from settings (hidden when not set). */
export function GuildServerBadge({ className }: { className?: string }) {
  const t = useT();
  const { status, settings } = useSettingsState();
  const server = status === "ready" ? settings.guild.server : "";
  if (!server) return null;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 border border-steel/20 bg-ink/60 px-2.5 py-1 text-[0.65rem] font-medium tracking-[0.2em] text-steel uppercase backdrop-blur-sm",
        className,
      )}
    >
      <span className="aion-pip size-1.5 rounded-full bg-[#7ee79e]" />
      <span>
        {t("Server")}{" "}<span className="text-gold-bright">{server}</span>
      </span>
    </div>
  );
}

export function LogoutButton() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("Log out")}
      data-testid="logout"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void logout();
      }}
      className="flex h-9 items-center gap-2 border border-steel/15 px-2.5 text-xs tracking-wider text-steel uppercase transition-colors outline-none hover:border-destructive/50 hover:bg-destructive/10 hover:text-[#f0b6aa] focus-visible:border-arcane/60 disabled:opacity-60"
    >
      <LogOut className="size-4" />
      <span className="hidden lg:inline">{busy ? t("Logging out…") : t("Logout")}</span>
    </button>
  );
}
