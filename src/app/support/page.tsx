import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { SupportBackLink, SupportView } from "@/components/support/support-view";

export const metadata: Metadata = {
  title: "Support — ChumChon AION2",
  alternates: { canonical: "/support" },
};

/** Public page (signed in, signed out or guest): the proxy lists /support in OPEN_PAGES. */
export default function SupportPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 pc:py-3">
      <PhotoBackdrop />
      <AuthShell title="Support ChumChon AION2" topRight={<SupportBackLink />} onPhoto compact>
        <SupportView />
      </AuthShell>
    </main>
  );
}
