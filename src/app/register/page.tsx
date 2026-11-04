import type { Metadata } from "next";
import { PhotoBackdrop } from "@/components/aion/photo-backdrop";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Register — ChumChon AION2",
};

export default function RegisterPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
      <PhotoBackdrop />
      <AuthShell title="Create an Account" subtitle="Register for this guild website and link your own AION 2 character." wide onPhoto>
        <RegisterForm />
      </AuthShell>
    </main>
  );
}
