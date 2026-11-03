import type { Metadata } from "next";
import { HistoryHub } from "@/components/roster/history-hub";

export const metadata: Metadata = {
  title: "Character History — AION II Guild Command",
};

export default function CharacterHistoryPage() {
  return <HistoryHub />;
}
