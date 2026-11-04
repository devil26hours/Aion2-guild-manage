import type { Metadata } from "next";
import { CharacterLookupFromUrl } from "@/components/lookup/character-lookup";

export const metadata: Metadata = {
  title: "Character Lookup — ChumChon AION2",
};

/** Public character lookup (AION2 API only — nothing is saved to the guild roster or database). */
export default function CharacterLookupPage() {
  return <CharacterLookupFromUrl />;
}
