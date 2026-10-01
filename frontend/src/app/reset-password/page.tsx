import { PasswordForm } from "@/components/auth/PasswordForm";
import {
  darkPageBackground,
  spacing,
} from "@/styles/tokens";

export default function ResetPasswordPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
        background: darkPageBackground,
      }}
    >
      <PasswordForm mode="reset" />
    </main>
  );
}