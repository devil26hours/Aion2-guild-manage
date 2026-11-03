import {
  Axe,
  BowArrow,
  Flame,
  Ghost,
  HeartPulse,
  Shield,
  Sparkles,
  Sword,
  type LucideIcon,
} from "lucide-react";
import type { AionClass } from "./classes";

/** Representative lucide icon per class (kept separate from data-only metadata). */
export const CLASS_ICONS: Record<AionClass, LucideIcon> = {
  Sorcerer: Flame,
  Gladiator: Axe,
  Spiritmaster: Ghost,
  Templar: Shield,
  Chanter: Sparkles,
  Ranger: BowArrow,
  Assassin: Sword,
  Cleric: HeartPulse,
};
