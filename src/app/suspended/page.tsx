import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { SuspendedNotice } from "@/components/auth/suspended-notice";

export const metadata: Metadata = {
  title: "Account suspended — ChumChon AION2",
};

/** Where the proxy sends a suspended account. It only offers a log-out button. */
export default function SuspendedPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 pc:py-3">
      <PhotoBackdrop />
      <AuthShell title="Account suspended" subtitle="This account cannot use ChumChon AION2 right now." onPhoto compact>
        <SuspendedNotice />
      </AuthShell>
    </main>
  );
}
