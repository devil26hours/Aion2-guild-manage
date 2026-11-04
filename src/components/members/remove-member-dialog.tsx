"use client";

import { AlertTriangle, UserMinus } from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import { aionButtonDanger, aionButtonSecondary, aionDialog } from "@/components/aion/styles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import type { GuildMember } from "@/data/mock/members";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RemoveMemberDialog({
  member,
  onCancel,
  onConfirm,
}: {
  member: GuildMember | null;
  onCancel: () => void;
  onConfirm: (member: GuildMember) => void;
}) {
  return (
    <AlertDialog open={member !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className={cn(aionDialog, "border-destructive/40")}>
        {member && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 font-heading text-base tracking-[0.1em] text-foreground uppercase">
                <AlertTriangle className="size-4 text-destructive" />
                Remove Member
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-steel">
                Remove <span className="font-semibold text-foreground">{member.character_name}</span>{" "}
                from the guild roster? Their notes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex items-center justify-between gap-3 border border-steel/12 bg-surface/60 px-3 py-2.5 text-xs">
              <div>
                <p className="text-sm font-medium text-foreground">{member.character_name}</p>
                <p className="text-subtle">
                  {member.server} · Lv. {member.level}
                </p>
              </div>
              <ClassBadge cls={member.class} withIcon />
              <p className="font-semibold text-brand-strong tabular-nums">
                {formatNumber(member.combat_power)} CP
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className={cn(buttonVariants({ variant: "outline" }), aionButtonSecondary)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onConfirm(member)}
                className={cn(buttonVariants(), aionButtonDanger)}
              >
                <UserMinus className="size-3.5" />
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
