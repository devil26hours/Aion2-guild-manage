import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = {
  title: "Forgot Password — ChumChon AION2",
};

export default function ForgotPasswordPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 pc:py-3">
      <PhotoBackdrop />
      <AuthShell title="Reset Password" subtitle="We will email you a link to choose a new password." onPhoto compact>
        <ForgotPasswordForm />
      </AuthShell>
    </main>
  );
}
