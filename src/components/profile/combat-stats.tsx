import { Crosshair, Shield, Swords, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionPanel } from "@/components/aion/section-panel";
import { CHARACTER_STAT_META } from "@/lib/aion/character-stat-meta";
import type { CharacterStatKey, CharacterStats } from "@/lib/aion/types";
import { formatNumber } from "@/lib/format";
import { MockTag } from "./item-bits";

const DECIMAL = new Set<CharacterStatKey>(["combat_speed", "move_speed", "boss_damage_boost"]);

function fmt(key: CharacterStatKey, v: number) {
  // Units for these stats are not confirmed by sources — shown as plain numbers.
  return DECIMAL.has(key) ? v.toFixed(1) : formatNumber(v);
}

function Group({
  title,
  icon: Icon,
  keys,
  emphasis,
  stats,
}: {
  title: string;
  icon: LucideIcon;
  keys: CharacterStatKey[];
  emphasis: CharacterStatKey;
  stats: CharacterStats;
}) {
  return (
    <div className="border border-steel/10 bg-surface/40">
      <h3 className="flex items-center gap-2 border-b border-steel/10 px-3 py-2 text-3xs font-semibold tracking-[0.18em] text-brand uppercase">
        <Icon className="size-3.5 text-brand" />
        {title}
      </h3>
      <dl className="divide-y divide-steel/[0.06]">
        {keys.map((k) => (
          <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt className="text-xs text-steel">{CHARACTER_STAT_META[k].label}</dt>
            <dd
              className={
                k === emphasis
                  ? "font-heading text-lg font-bold text-brand-strong tabular-nums"
                  : "text-sm font-semibold text-foreground tabular-nums"
              }
            >
              {fmt(k, stats[k])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Vital({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-3xs font-semibold tracking-[0.18em] text-steel uppercase">{label}</span>
        <span className="font-heading text-lg font-bold text-foreground tabular-nums">{formatNumber(value)}</span>
      </div>
      <div className="mt-1 h-2 border border-steel/15 bg-surface p-px">
        <div className="h-full" style={{ background: `linear-gradient(90deg, ${color}99, ${color})` }} />
      </div>
    </div>
  );
}

export function CombatStats({ stats }: { stats: CharacterStats }) {
  return (
    <SectionPanel
      title="Combat Statistics"
      description="Character-window stats · base + item stats + Soul Binding"
      icon={Swords}
      action={stats.origin === "mock" ? <MockTag /> : undefined}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Vital label="HP" value={stats.hp} color="#cf5b45" />
        <Vital label="MP" value={stats.mp} color="#3987e5" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Group
          title="Offense"
          icon={Crosshair}
          stats={stats}
          emphasis="attack"
          keys={["attack", "accuracy", "critical_hit", "combat_speed"]}
        />
        <Group
          title="Defense"
          icon={Shield}
          stats={stats}
          emphasis="defense"
          keys={["defense", "evasion", "block", "critical_hit_resist", "move_speed"]}
        />
        <Group
          title="PvE"
          icon={Trophy}
          stats={stats}
          emphasis="pve_attack"
          keys={["pve_attack", "pve_defense", "boss_damage_boost"]}
        />
      </div>
    </SectionPanel>
  );
}
