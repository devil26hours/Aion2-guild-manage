import type { Metadata } from "next";
import { HistoryHub } from "@/components/roster/history-hub";

export const metadata: Metadata = {
  title: "Character History — ChumChon AION2",
};

export default function CharacterHistoryPage() {
  return <HistoryHub />;
}
