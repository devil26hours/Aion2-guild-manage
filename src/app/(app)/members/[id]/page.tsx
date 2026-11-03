import type { Metadata } from "next";
import { Suspense } from "react";
import { CharacterProfile } from "@/components/profile/character-profile";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { RealMemberProfile } from "@/components/roster/real-member-profile";
import { ROSTER_ID_RE } from "@/lib/roster/types";

export const metadata: Metadata = {
  title: "Character Profile — AION II Guild Command",
};

/** Route segments may arrive URL-encoded (real roster ids contain ":" and "="). */
function decodeId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * `params` is runtime data under Cache Components, so it is resolved inside
 * Suspense; the shell (layout + skeleton) is prerendered.
 * Real roster ids (region:serverId:characterId) show the stored API profile;
 * any other id is a character from the simulated demo data (Character History → Demo tab).
 */
export default function MemberProfilePage({ params }: PageProps<"/members/[id]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      {params.then(({ id }) => {
        const decoded = decodeId(id);
        return ROSTER_ID_RE.test(decoded) ? <RealMemberProfile id={decoded} /> : <CharacterProfile id={id} />;
      })}
    </Suspense>
  );
}
