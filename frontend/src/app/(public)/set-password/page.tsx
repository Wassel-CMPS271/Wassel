import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordForm } from "@/components/auth/PasswordForm";

export const metadata: Metadata = {
  title: "Set password",
};

export default function SetPasswordPage() {
  return (
    <AuthShell headline="Welcome aboard.">
      <PasswordForm mode="setup" />
    </AuthShell>
  );
}
