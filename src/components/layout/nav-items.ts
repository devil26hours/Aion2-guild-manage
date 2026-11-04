import {
  Bell,
  FlaskConical,
  Gauge,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  ScanSearch,
  Settings,
  Swords,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users },
  { href: "/character-history", label: "Character History", icon: History },
  { href: "/character-lookup", label: "Character Lookup", icon: ScanSearch },
  { href: "/party-builder", label: "Party Builder", icon: Swords },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** One DEV menu, shown only to a DEV account (display hint; the pages and APIs check the role on the server). */
export const DEV_NAV_ITEMS: NavItem[] = [
  { href: "/dev/users", label: "User Management", icon: UserCog },
  { href: "/dev/announcements", label: "Announcements & Notifications", icon: Megaphone },
  { href: "/dev/feedback", label: "Feedback Management", icon: Inbox },
  { href: "/dev/api-lab", label: "API Lab", icon: FlaskConical },
  { href: "/dev/overview", label: "System Overview", icon: Gauge },
];

/** Legacy paths that redirect to a current page (keep their menu item active). */
const ALIASES: Record<string, string> = { "/history": "/character-history", "/party": "/party-builder" };

export function isNavActive(pathname: string, href: string): boolean {
  const path = ALIASES[pathname] ?? pathname;
  return path === href || path.startsWith(`${href}/`);
}
