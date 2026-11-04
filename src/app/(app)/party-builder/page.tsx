import type { Metadata } from "next";
import { PartyBuilder } from "@/components/party/party-builder";

export const metadata: Metadata = {
  title: "Party Builder — ChumChon AION2",
};

export default function PartyBuilderPage() {
  return <PartyBuilder />;
}
