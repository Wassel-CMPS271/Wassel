import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandLink } from "@/components/ui/BrandMark";
import { spacing } from "@/styles/tokens";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.lg,
        padding: spacing.lg,
      }}
    >
      <BrandLink />
      <LoginForm />
    </main>
  );
}
