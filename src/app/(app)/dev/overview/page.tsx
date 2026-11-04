import type { Metadata } from "next";
import { SystemOverviewView } from "@/components/dev/system-overview";

export const metadata: Metadata = {
  title: "System Overview — DEV — ChumChon AION2",
};

export default function DevOverviewPage() {
  return <SystemOverviewView />;
}
