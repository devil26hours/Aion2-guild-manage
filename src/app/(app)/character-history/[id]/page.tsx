import type { Metadata } from "next";
import { Suspense } from "react";
import { CharacterHistoryView } from "@/components/history/character-history-view";
import { ProfileSkeleton } from "@/components/profile/profile-skeleton";
import { RealHistoryView } from "@/components/roster/real-history-view";
import { ROSTER_ID_RE } from "@/lib/roster/types";

/** Route segments may arrive URL-encoded (real roster ids contain ":" and "="). */
function decodeId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

export const metadata: Metadata = {
  title: "Character Progression — AION II Guild Command",
};

/**
 * `params` / `searchParams` are runtime data under Cache Components, so they
 * resolve inside Suspense while the shell is prerendered.
 */
export default function CharacterHistoryDetailPage({
  params,
  searchParams,
}: PageProps<"/character-history/[id]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ id }, sp]) => {
        const decoded = decodeId(id);
        // Real roster member (region:serverId:characterId) → live API data + real snapshots.
        if (ROSTER_ID_RE.test(decoded)) return <RealHistoryView id={decoded} />;
        // Otherwise the simulated demo history (e.g. dashboard links to m001…).
        return (
          <CharacterHistoryView
            id={id}
            focusSnapshotId={typeof sp.snapshot === "string" ? sp.snapshot : null}
          />
        );
      })}
    </Suspense>
  );
}
