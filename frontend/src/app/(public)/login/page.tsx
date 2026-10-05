import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

// Read here, not with useSearchParams in the form, which would need a Suspense
// boundary to build.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; passwordSet?: string }>;
}) {
  const { expired, passwordSet } = await searchParams;
  const notice = expired ? "expired" : passwordSet ? "passwordSet" : undefined;

  return (
    <AuthShell headline="Welcome back.">
      <LoginForm notice={notice} />
    </AuthShell>
  );
}
