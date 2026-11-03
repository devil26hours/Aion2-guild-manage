"use client";

import Link from "next/link";
import { Ellipsis, History, RefreshCw, UserMinus, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GuildMember } from "@/data/mock/members";

export function MemberRowActions({
  member,
  refreshing,
  onRefresh,
  onRemove,
}: {
  member: GuildMember;
  refreshing: boolean;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label={`Refresh ${member.character_name}`}
        title="Refresh character data"
        className="flex size-8 items-center justify-center border border-transparent text-steel/70 transition-colors outline-none hover:border-steel/20 hover:text-arcane focus-visible:border-arcane/50 disabled:text-arcane"
      >
        <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${member.character_name}`}
          className="flex size-8 items-center justify-center border border-transparent text-steel/70 transition-colors outline-none hover:border-steel/20 hover:text-gold-bright focus-visible:border-arcane/50 data-[state=open]:border-gold-dim/50 data-[state=open]:text-gold-bright"
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52 rounded-none border-gold-dim/30 bg-ink-raised"
        >
          <DropdownMenuLabel className="truncate text-xs text-steel">
            {member.character_name} · {member.server}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="rounded-none">
            <Link href={`/members/${member.id}`}>
              <UserRound />
              View Character Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-none">
            <Link href={`/character-history/${member.id}`}>
              <History />
              View Character History
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="rounded-none"
            disabled={refreshing}
            onSelect={onRefresh}
          >
            <RefreshCw />
            Refresh Character Data
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="rounded-none"
            onSelect={onRemove}
          >
            <UserMinus />
            Remove Member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
