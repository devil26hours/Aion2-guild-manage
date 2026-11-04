import Link from "next/link";
import { ChevronRight, Crown } from "lucide-react";
import { ClassBadge } from "@/components/aion/class-badge";
import { SectionPanel } from "@/components/aion/section-panel";
import type { GuildMember } from "@/data/mock/members";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANK_STYLE = [
  "border-gold/70 bg-gold/15 text-gold-text",
  "border-steel/50 bg-steel/10 text-foreground",
  "border-bronze/70 bg-bronze/15 text-bronze-text",
];

export function TopMembers({ members }: { members: GuildMember[] }) {
  return (
    <SectionPanel
      title="Top Members"
      description="Ranked by Combat Power"
      icon={Crown}
      bodyClassName="p-0 sm:p-0"
      action={
        <Link
          href="/members"
          className="flex shrink-0 items-center gap-1 text-xs text-brand transition-colors hover:text-brand-strong"
        >
          View all <ChevronRight className="size-3.5" />
        </Link>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[34rem]">
          <thead>
            <tr className="border-b border-steel/10 text-left text-3xs tracking-[0.16em] text-subtle uppercase">
              <th scope="col" className="w-10 py-2.5 pl-4 font-medium sm:w-12 sm:pl-5">#</th>
              <th scope="col" className="py-2.5 pl-2 font-medium sm:pl-0">Character</th>
              <th scope="col" className="hidden py-2.5 font-medium sm:table-cell">Class</th>
              <th scope="col" className="py-2.5 pl-3 text-right font-medium">
                <abbr title="Level" className="no-underline sm:hidden">Lv.</abbr>
                <span className="hidden sm:inline">Level</span>
              </th>
              <th scope="col" className="py-2.5 pl-3 text-right font-medium">
                <abbr title="Combat Power" className="no-underline sm:hidden">CP</abbr>
                <span className="hidden sm:inline">Combat Power</span>
              </th>
              <th scope="col" className="py-2.5 pr-4 pl-3 text-right font-medium sm:pr-5">
                <abbr title="Item Level" className="no-underline sm:hidden">iLv</abbr>
                <span className="hidden sm:inline">Item Lv.</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr
                key={m.id}
                className="border-b border-steel/[0.07] transition-colors last:border-0 hover:bg-surface-hover"
              >
                <td className="py-3 pl-4 sm:pl-5">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center border text-xs font-semibold tabular-nums",
                      RANK_STYLE[i] ?? "border-steel/20 text-steel",
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-3 pl-2 font-medium text-foreground sm:pl-0">
                  <Link
                    href={`/members/${m.id}`}
                    className="underline-offset-4 hover:text-brand-strong hover:underline"
                  >
                    {m.character_name}
                  </Link>
                  <ClassBadge
                    cls={m.class}
                    className="mt-0.5 flex text-2xs font-normal sm:hidden"
                  />
                </td>
                <td className="hidden py-3 text-xs sm:table-cell">
                  <ClassBadge cls={m.class} />
                </td>
                <td className="py-3 pl-3 text-right text-steel tabular-nums">{m.level}</td>
                <td className="py-3 pl-3 text-right font-semibold text-brand-strong tabular-nums">
                  {formatNumber(m.combat_power)}
                </td>
                <td className="py-3 pr-4 pl-3 text-right text-foreground/85 tabular-nums sm:pr-5">
                  {m.item_level}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}
