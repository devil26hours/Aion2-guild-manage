"use client";

import { Bell, CheckCheck, ListChecks, Loader2, Megaphone, UsersRound } from "lucide-react";
import Link from "next/link";
import { RelativeTime } from "@/components/aion/relative-time";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { loadNotifications, markRead, useNotifications } from "@/lib/notifications/store";
import { cn } from "@/lib/utils";

/** Header bell: unread badge and the 10 most recent items for this account's role. Rendered by AppHeader only, so guests and signed-out visitors never get it. */
export function NotificationBell({ className }: { className?: string }) {
  const t = useT();
  const { unread, items, listStatus } = useNotifications();
  const label = unread > 0 ? t("Notifications ({count} unread)", { count: unread }) : t("Notifications");
  return (
    <DropdownMenu onOpenChange={(open) => open && void loadNotifications()}>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        data-testid="notification-bell"
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center border border-steel/20 bg-surface/60 text-steel transition-colors outline-none",
          "hover:border-brand-muted/60 hover:text-brand-strong focus-visible:border-arcane/60 focus-visible:ring-2 focus-visible:ring-arcane/30 data-[state=open]:border-brand-muted/60",
          className,
        )}
      >
        <Bell aria-hidden className="size-4" />
        {unread > 0 && (
          <span aria-hidden className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-gold/60 bg-destructive px-1 text-[0.625rem] leading-none font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] rounded-md border-gold/35 bg-surface-raised p-0 shadow-float">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="font-heading text-xs tracking-[0.14em] text-brand-strong uppercase">{t("Notifications")}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markRead()}
              className="flex items-center gap-1 text-2xs font-medium text-brand outline-none hover:text-brand-strong focus-visible:underline"
            >
              <CheckCheck aria-hidden className="size-3.5" /> {t("Mark all read")}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
          {listStatus === "loading" && items.length === 0 && (
            <p role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-steel">
              <Loader2 aria-hidden className="size-4 animate-spin" /> {t("Loading…")}
            </p>
          )}
          {listStatus === "error" && <p role="alert" className="px-3 py-6 text-center text-sm text-danger-text">{t("Could not load notifications.")}</p>}
          {listStatus === "ready" && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-steel">{t("You're all caught up.")}</p>}
          {items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              // Keep the menu open so several items can be read.
              onSelect={(e) => {
                e.preventDefault();
                if (!n.is_read) void markRead([n.id]);
              }}
              className="block rounded-none border-b border-steel/10 px-3 py-2.5 last:border-b-0"
            >
              <span className="flex items-start gap-2">
                <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-arcane")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {n.kind === "announcement" && <Megaphone aria-label={t("Announcement")} className="size-3.5 shrink-0 text-gold-text" />}
                    {n.kind === "guild" && <UsersRound aria-label={t("Guild")} className="size-3.5 shrink-0 text-info-text" />}
                    <span className={cn("truncate text-sm", n.is_read ? "text-steel" : "font-semibold text-foreground")}>{n.title}</span>
                  </span>
                  {/* Plain text only: the message is untrusted content. */}
                  <span className="mt-0.5 line-clamp-4 block text-xs break-words whitespace-pre-wrap text-steel">{n.body}</span>
                  <RelativeTime iso={n.created_at} className="mt-1 block text-3xs text-subtle" />
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem asChild className="justify-center rounded-none px-3 py-2.5 text-xs font-semibold tracking-wider text-brand uppercase focus:text-brand-strong">
          <Link href="/notifications" data-testid="notification-view-all">
            <ListChecks aria-hidden className="size-3.5" /> {t("View all notifications")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
