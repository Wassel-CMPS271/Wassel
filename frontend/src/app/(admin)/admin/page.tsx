import type { ComponentType } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { CalendarIcon, ClockIcon } from "@/components/ui/icons";
import { colors, darkTheme, radius, spacing } from "@/styles/tokens";

interface Feature {
  title: string;
  description: string;
  href?: string;
  cta?: string;
  Icon: ComponentType<{ size?: number }>;
}

// The holiday calendar and half-days arrive with SCRUM-179.
const FEATURES: Feature[] = [
  {
    title: "School times",
    description:
      "Set when students arrive at school and when they are dismissed. Route planning treats both as fixed.",
    href: "/admin/school-times",
    cta: "Open school times",
    Icon: ClockIcon,
  },
  {
    title: "Holiday calendar",
    description: "Add holidays and mark half-days so routes only run on days school is open.",
    Icon: CalendarIcon,
  },
];

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
          School administration
        </h1>
        <p className="text-base" style={{ color: darkTheme.text.secondary, marginTop: spacing.xs }}>
          Configure how your school runs.
        </p>
      </header>

      <ul
        role="list"
        className="grid sm:grid-cols-2"
        style={{ gap: spacing.md, padding: 0, margin: 0 }}
      >
        {FEATURES.map(({ title, description, href, cta, Icon }) => (
          <li key={title} className="list-none">
            {href ? (
              <Link
                href={href}
                className="block h-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: colors.primary[400] }}
              >
                <Card className="h-full flex flex-col">
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center"
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: radius.lg,
                      marginBottom: spacing.md,
                      backgroundColor: "rgba(26, 86, 255, 0.14)",
                      color: colors.primary[300],
                    }}
                  >
                    <Icon size={20} />
                  </span>
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
                  >
                    {title}
                  </h2>
                  <p
                    className="text-sm flex-1"
                    style={{ color: darkTheme.text.secondary, marginBottom: spacing.md }}
                  >
                    {description}
                  </p>
                  <span className="text-sm font-medium" style={{ color: colors.primary[300] }}>
                    {cta} <span aria-hidden="true">→</span>
                  </span>
                </Card>
              </Link>
            ) : (
              <Card
                className="h-full flex flex-col"
                style={{
                  borderStyle: "dashed",
                  boxShadow: "none",
                  backgroundColor: "rgba(20, 22, 29, 0.5)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center"
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: radius.lg,
                    marginBottom: spacing.md,
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: darkTheme.text.muted,
                  }}
                >
                  <Icon size={20} />
                </span>
                <h2
                  className="text-lg font-semibold"
                  style={{ color: darkTheme.text.secondary, marginBottom: spacing.xs }}
                >
                  {title}
                </h2>
                <p
                  className="text-sm flex-1"
                  style={{ color: darkTheme.text.muted, marginBottom: spacing.md }}
                >
                  {description}
                </p>
                <span
                  className="self-start text-xs font-medium"
                  style={{
                    padding: `2px ${spacing.sm}`,
                    borderRadius: radius.full,
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    color: darkTheme.text.muted,
                  }}
                >
                  Coming soon
                </span>
              </Card>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
