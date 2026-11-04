import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { CookiePolicyView } from "@/components/cookies/cookie-policy-view";
import { SupportBackLink } from "@/components/support/support-view";

export const metadata: Metadata = {
  title: "Cookie Policy — ChumChon AION2",
  alternates: { canonical: "/cookie-policy" },
};

/** Public page (signed in, signed out or guest): the proxy lists /cookie-policy in OPEN_PAGES. */
export default function CookiePolicyPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center px-4 py-10 sm:px-6">
      <PhotoBackdrop />
      <AuthShell title="Cookie Policy" topRight={<SupportBackLink />} onPhoto wide>
        <CookiePolicyView />
      </AuthShell>
    </main>
  );
}
