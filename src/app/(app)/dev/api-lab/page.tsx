import type { Metadata } from "next";
import { ApiLabGate } from "@/components/api-lab/api-lab-gate";

export const metadata: Metadata = {
  title: "API Lab — DEV — ChumChon AION2",
};

/** Developer page for testing the local AION2 API via /api/aion2/*. DEV only, behind an extra password gate. */
export default function ApiLabPage() {
  return <ApiLabGate />;
}
