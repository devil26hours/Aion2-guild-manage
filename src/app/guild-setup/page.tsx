import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { GuildSetup } from "@/components/guild-setup/guild-setup";

export const metadata: Metadata = {
  title: "Choose a Guild — ChumChon AION2",
};

/** Accounts without a guild are redirected here by the proxy until they join or create one. */
export default function GuildSetupPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
      <PhotoBackdrop />
      <AuthShell title="Choose Your Guild" subtitle="Your character is not in a guild yet. Join an existing guild or create a new one." wide>
        <GuildSetup />
      </AuthShell>
    </main>
  );
}
