import { Card } from "@/components/ui/Card";
import { colors, darkTheme, spacing } from "@/styles/tokens";

// Landing page after a driver logs in. The route and student views arrive in Sprint 2.
export default function Page() {
  return (
    <main style={{ padding: spacing.xl, maxWidth: "1024px" }}>
      <header style={{ marginBottom: spacing.xl }}>
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.accent[300], marginBottom: spacing.xs }}
        >
          Overview
        </p>
        <h1 className="text-3xl font-semibold" style={{ color: darkTheme.text.primary }}>
          Driver
        </h1>
        <p className="text-base" style={{ color: darkTheme.text.secondary, marginTop: spacing.xs }}>
          Your route and students will appear here.
        </p>
      </header>

      <Card
        style={{
          borderStyle: "dashed",
          boxShadow: "none",
          backgroundColor: "rgba(20, 22, 29, 0.5)",
        }}
      >
        <p className="text-sm font-medium" style={{ color: darkTheme.text.secondary }}>
          Route view coming soon
        </p>
        <p className="text-sm" style={{ color: darkTheme.text.muted, marginTop: spacing.xs }}>
          Driver features are scheduled for Sprint 2.
        </p>
      </Card>
    </main>
  );
}
