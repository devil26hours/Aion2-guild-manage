import type { Metadata } from "next";
import { PartyBuilder } from "@/components/party/party-builder";

export const metadata: Metadata = {
  title: "Party Builder — AION II Guild Command",
};

export default function PartyBuilderPage() {
  return <PartyBuilder />;
}
