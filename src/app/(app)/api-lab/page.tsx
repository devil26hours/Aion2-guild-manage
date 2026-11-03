import type { Metadata } from "next";
import { ApiLabGate } from "@/components/api-lab/api-lab-gate";

export const metadata: Metadata = {
  title: "API Lab — AION II Guild Command",
};

/** Developer page for testing the local AION2 API via /api/aion2/* — behind login + an extra password gate. */
export default function ApiLabPage() {
  return <ApiLabGate />;
}
