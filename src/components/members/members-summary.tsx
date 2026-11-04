import { Crown, Layers, Swords, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { GuildMember } from "@/data/mock/members";
import { AION_CLASSES } from "@/lib/aion/classes";
import { getGuildSummary } from "@/lib/aion/guild-stats";
import { formatNumber } from "@/lib/format";

export function MembersSummary({
  members,
  memberCap,
}: {
  members: GuildMember[];
  memberCap: number;
}) {
  const summary = getGuildSummary(members);
  const classCount = new Set(members.map((m) => m.class)).size;
  const servers = new Set(members.map((m) => m.server)).size;

  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <StatCard
        label="Total Members"
        value={formatNumber(summary.totalMembers)}
        icon={Users}
        detail={`${Math.max(0, memberCap - summary.totalMembers)} of ${memberCap} slots open`}
      />
      <StatCard
        label="Average CP"
        value={formatNumber(summary.averageCp)}
        icon={Swords}
        detail={`Avg item level ${summary.averageItemLevel}`}
      />
      <StatCard
        label="Highest CP"
        value={summary.highestCp ? formatNumber(summary.highestCp.value) : "—"}
        icon={Crown}
        detail={
          summary.highestCp && (
            <>
              <span className="text-brand-strong">
                {summary.highestCp.member.character_name}
              </span>{" "}
              · {summary.highestCp.member.class}
            </>
          )
        }
      />
      <StatCard
        label="Class Count"
        value={`${classCount} / ${AION_CLASSES.length}`}
        icon={Layers}
        detail={`Classes represented · ${servers} servers`}
      />
    </div>
  );
}
