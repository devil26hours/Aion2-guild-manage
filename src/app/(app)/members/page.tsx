import type { Metadata } from "next";
import { RosterManager } from "@/components/roster/roster-manager";

export const metadata: Metadata = {
  title: "Guild Members — AION II Guild Command",
};

/** Real guild roster (AION2 API + local JSON persistence). */
export default function MembersPage() {
  return <RosterManager />;
}
