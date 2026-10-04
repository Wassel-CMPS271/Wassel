import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordForm } from "@/components/auth/PasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell headline="Welcome back.">
      <PasswordForm mode="reset" />
    </AuthShell>
  );
}
