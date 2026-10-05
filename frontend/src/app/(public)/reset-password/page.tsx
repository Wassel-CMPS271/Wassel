import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordForm } from "@/components/auth/PasswordForm";

export const metadata: Metadata = {
  title: "Reset password",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // Next gives an array for a repeated ?token=; a blank one counts as missing.
  const value = (Array.isArray(token) ? token[0] : token)?.trim();

  return (
    <AuthShell headline="Welcome back.">
      <PasswordForm mode="reset" token={value || undefined} />
    </AuthShell>
  );
}
