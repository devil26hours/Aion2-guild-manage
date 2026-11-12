"use client";


import { useT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { RelativeTime } from "@/components/aion/relative-time";
import { aionDialog } from "@/components/aion/styles";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getRosterMemberDetail } from "@/lib/roster/roster-store";
import type { RosterMember } from "@/lib/roster/types";
import { cn } from "@/lib/utils";
import { CharacterProfileView, isInGearPin } from "./character-profile-view";
import { isBoardFullscreenOpen, isInBoardFullscreen } from "./daevanion-board";

type Detail = { status: "loading" } | { status: "ready"; raw: unknown } | { status: "error"; message: string };

/** Member information rendered as a character profile (raw API data is collapsed). */
export function MemberDetailDialog({ member, onClose }: { member: RosterMember | null; onClose: () => void }) {
  return (
    <Dialog open={member !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Up to (almost) the whole viewport: the profile's two-column panels, the Daevanion board
        // with its Active Effects column and the equipment grid get the room they are laid out for.
        className={cn(
          aionDialog,
          "w-[calc(100vw-1rem)] max-w-[1720px] gap-4 p-3 sm:w-[calc(100vw-2.5rem)] sm:p-5 lg:p-6",
          "max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2.5rem)]",
        )}
        // Pinned equipment tooltips and the fullscreen Daevanion board live outside the dialog DOM
        // (portaled to <body>): interacting with them must not close it.
        onInteractOutside={(e) => (isInGearPin(e.target) || isInBoardFullscreen(e.target)) && e.preventDefault()}
        // Escape while the Daevanion board is fullscreen leaves fullscreen only.
        onEscapeKeyDown={(e) => isBoardFullscreenOpen() && e.preventDefault()}
        data-testid="member-detail-dialog"
      >
        {member && <Body key={member.id} member={member} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ member }: { member: RosterMember }) {
  const t = useT();
  const [detail, setDetail] = useState<Detail>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getRosterMemberDetail(member.id).then((r) => {
      if (cancelled) return;
      setDetail(r.ok ? { status: "ready", raw: r.data.api_raw } : { status: "error", message: r.error.message });
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  return (
    <>
      <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
        <div className="min-w-0 text-left">
          <DialogTitle className="font-heading text-sm tracking-[0.18em] text-brand-strong uppercase">{t("Character Profile")}</DialogTitle>
          <DialogDescription className="text-xs text-steel">
            {t("Added")}{" "}<RelativeTime iso={member.added_at} /> {" "}{t("· data from the AION2 API")}</DialogDescription>
        </div>
        <Link
          href={`/character-history/${encodeURIComponent(member.id)}`}
          className="flex shrink-0 items-center gap-1 text-xs text-brand hover:text-brand-strong"
        >
          {t("View history")}{" "}<ChevronRight className="size-3.5" />
        </Link>
      </DialogHeader>

      {member.last_refresh_error && (
        <p className="flex items-start gap-2 border border-warning/35 bg-warning/[0.07] px-3 py-2 text-xs text-warning-text">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {t("Last refresh failed")}{" "}<RelativeTime iso={member.last_refresh_error.at} />: {member.last_refresh_error.message}
        </p>
      )}
      {member.notes && <p className="border-l-2 border-steel/25 pl-2.5 text-xs text-steel italic">{member.notes}</p>}

      {detail.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-steel"><Loader2 className="size-4 animate-spin" /> {" "}{t("Loading character profile…")}</p>
      )}
      {detail.status === "error" && <p className="text-sm text-danger-text">{t("Could not load the stored profile:")}{" "}{detail.message}</p>}
      {detail.status === "ready" && <CharacterProfileView member={member} raw={detail.raw} itemDetails />}
    </>
  );
}
