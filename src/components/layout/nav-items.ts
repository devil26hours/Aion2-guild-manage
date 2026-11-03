import {
  FlaskConical,
  History,
  LayoutDashboard,
  Settings,
  Swords,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Developer/admin tool — listed separately. */
  dev?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users },
  { href: "/character-history", label: "Character History", icon: History },
  { href: "/party-builder", label: "Party Builder", icon: Swords },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/api-lab", label: "API Lab", icon: FlaskConical, dev: true },
];

/** Legacy paths that redirect to a current page (keep their menu item active). */
const ALIASES: Record<string, string> = { "/history": "/character-history", "/party": "/party-builder" };

export function isNavActive(pathname: string, href: string): boolean {
  const path = ALIASES[pathname] ?? pathname;
  return path === href || path.startsWith(`${href}/`);
}
