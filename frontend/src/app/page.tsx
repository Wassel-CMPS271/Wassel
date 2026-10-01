import { LoginForm } from "@/components/auth/LoginForm";
import {
  darkPageBackground,
  spacing,
} from "@/styles/tokens";

export default function HomePage() {
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
      <LoginForm />
    </main>
  );
}