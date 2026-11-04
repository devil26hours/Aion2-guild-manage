import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { SupportButton } from "@/components/support/support-button";

export const metadata: Metadata = {
  title: "Sign In — ChumChon AION2",
};

export default function LoginPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 pc:py-3">
      <PhotoBackdrop />
      <AuthShell title="Commander Sign-In" subtitle="Sign in with your guild website account." topRight={<SupportButton />} onPhoto compact>
        <LoginForm />
      </AuthShell>
    </main>
  );
}
