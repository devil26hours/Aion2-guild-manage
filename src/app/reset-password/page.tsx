import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = {
  title: "Set New Password — ChumChon AION2",
};

/** Reached through the password-reset email link (the proxy requires the recovery session). */
export default function ResetPasswordPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 pc:py-3">
      <PhotoBackdrop />
      <AuthShell title="Set New Password" subtitle="Choose a new password for this website." onPhoto compact>
        <ResetPasswordForm />
      </AuthShell>
    </main>
  );
}
