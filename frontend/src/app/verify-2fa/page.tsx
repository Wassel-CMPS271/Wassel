import { TwoFactorForm } from "@/components/auth/TwoFactorForm";
import {
  darkPageBackground,
  spacing,
} from "@/styles/tokens";

export default function VerifyTwoFactorPage() {
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
      <TwoFactorForm />
    </main>
  );
}