import type { Metadata } from "next";
import { CharacterLookup } from "@/components/lookup/character-lookup";

export const metadata: Metadata = {
  title: "Character Lookup — ChumChon AION2",
};

export default function GuestLookupPage() {
  return <CharacterLookup />;
}
