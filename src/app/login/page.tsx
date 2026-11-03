import type { Metadata } from "next";
import { FantasyBackdrop } from "@/components/aion/fantasy-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In — AION II Guild Command",
};

export default function LoginPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
      <FantasyBackdrop />
      <AuthShell title="Commander Sign-In" subtitle="Sign in with your guild website account.">
        <LoginForm />
      </AuthShell>
    </main>
  );
}
