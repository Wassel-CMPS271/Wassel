import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { TwoFactorForm } from "@/components/auth/TwoFactorForm";

export const metadata: Metadata = {
  title: "Verify sign-in",
};

export default function VerifyTwoFactorPage() {
  return (
    <AuthShell headline="Welcome back.">
      <TwoFactorForm />
    </AuthShell>
  );
}
