import type { ComponentType, CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { AmbientVideo } from "@/components/landing/AmbientVideo";
import { Reveal } from "@/components/landing/Reveal";
import { BrandLink, BrandMark } from "@/components/ui/BrandMark";
import { CtaLink } from "@/components/ui/Button";
import { focusRingClass, focusRingStyle } from "@/components/ui/focusRing";
import { Card } from "@/components/ui/Card";
import { ClockIcon, StudentIcon, VehicleIcon } from "@/components/ui/icons";
import {
  colors,
  darkTheme,
  iconSize,
  landing,
  radius,
  sizing,
  spacing,
  typography,
} from "@/styles/tokens";

const CONTAINER_STYLE: CSSProperties = {
  maxWidth: landing.contentMaxWidth,
  paddingLeft: spacing.lg,
  paddingRight: spacing.lg,
};

const SECTION_PADDING: CSSProperties = {
  paddingTop: spacing["4xl"],
  paddingBottom: spacing["4xl"],
};

const CARD_TITLE_STYLE: CSSProperties = {
  color: darkTheme.text.primary,
  fontWeight: typography.fontWeight.semibold,
};

const LIST_RESET: CSSProperties = { padding: 0, listStyle: "none" };

// Problem -> solution -> who it's for -> action. Copy stays at the level of
// what Wassel is being built to do; features still in the backlog are not
// described as shipped.
const PROBLEMS = [
  "Routes are drawn by hand and go stale within weeks.",
  "Parents call the office to ask where the bus is.",
  "Problems reach the school after the fact.",
  "When something goes wrong, it is one person's word against another's.",
];

const COMMITMENTS: { title: string; line: string; Icon: ComponentType<{ size?: number }> }[] = [
  {
    title: "Routes that match the day",
    line: "Planned around the students actually riding, not last term's list.",
    Icon: VehicleIcon,
  },
  {
    title: "Pickups confirmed, not assumed",
    line: "Each pickup and dropoff is marked with the time it happened.",
    Icon: StudentIcon,
  },
  {
    title: "A record everyone can check",
    line: "The school, the driver and the parent look at the same account of the morning.",
    Icon: ClockIcon,
  },
];

const ROLES = [
  {
    role: "School",
    title: "Head of Transportation",
    line: "Manage vehicles, drivers and students from one place.",
    image: "/landing/role-head-of-transport.webp",
    video: true,
  },
  {
    role: "Driver",
    title: "On the route",
    line: "Start the run knowing the stops and who should be on board.",
    image: "/landing/role-driver.webp",
    video: false,
  },
  {
    role: "Parent",
    title: "At the curb",
    line: "Check on your child's ride without calling the office.",
    image: "/landing/role-parent.webp",
    video: false,
  },
];

const ROLE_IMAGE_SIZES = "(min-width: 1024px) 33vw, 100vw";

function SectionHeader({
  id,
  eyebrow,
  title,
  takeaway,
}: {
  id: string;
  eyebrow: string;
  title: string;
  takeaway: string;
}) {
  return (
    <Reveal className="max-w-2xl">
      <p
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: colors.accent[300], margin: 0 }}
      >
        {eyebrow}
      </p>
      <h2
        id={id}
        style={{
          ...CARD_TITLE_STYLE,
          fontSize: landing.display.section.size,
          lineHeight: landing.display.section.lineHeight,
          margin: `${spacing.sm} 0 0`,
        }}
      >
        {title}
      </h2>
      <p className="text-lg" style={{ color: darkTheme.text.secondary, margin: `${spacing.md} 0 0` }}>
        {takeaway}
      </p>
    </Reveal>
  );
}

function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ paddingTop: spacing["3xl"], paddingBottom: spacing["3xl"] }}>
      <div className="mx-auto" style={CONTAINER_STYLE}>
        {children}
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:absolute focus:z-30 focus:inline-flex focus:items-center text-sm font-medium ${focusRingClass}`}
        style={{
          ...focusRingStyle,
          top: spacing.md,
          left: spacing.md,
          minHeight: sizing.tapTarget,
          padding: `${spacing.sm} ${spacing.md}`,
          borderRadius: radius.md,
          backgroundColor: darkTheme.surface.card,
          color: darkTheme.text.primary,
        }}
      >
        Skip to content
      </a>

      <header className="absolute inset-x-0 top-0 z-20">
        <nav
          aria-label="Main"
          className="mx-auto flex items-center justify-between"
          style={{ ...CONTAINER_STYLE, paddingTop: spacing.lg, paddingBottom: spacing.lg }}
        >
          <BrandLink />
          <CtaLink href="/login">Sign in</CtaLink>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="focus:outline-none">
        <section aria-labelledby="hero-title">
          <AmbientVideo
            src="/landing/hero"
            poster="/landing/hero-poster.webp"
            fallbackImage="/landing/hero-poster.webp"
            sizes="100vw"
            priority
            fadeAtEnd
            mediaPosition="72% center"
            className="isolate flex min-h-[100svh] items-center"
            overlay={
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 lg:hidden"
                  style={{ background: landing.heroScrimNarrow }}
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 hidden lg:block"
                  style={{ background: landing.heroScrimWide }}
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{ background: landing.heroFadeBottom }}
                />
              </>
            }
          >
            <div className="relative mx-auto w-full" style={{ ...CONTAINER_STYLE, ...SECTION_PADDING }}>
              <div className="max-w-xl">
                <Reveal>
                  <p
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: colors.accent[300], margin: 0 }}
                  >
                    School transport platform
                  </p>
                </Reveal>
                <Reveal index={1}>
                  <h1
                    id="hero-title"
                    style={{
                      ...CARD_TITLE_STYLE,
                      fontSize: landing.display.hero.size,
                      lineHeight: landing.display.hero.lineHeight,
                      margin: `${spacing.md} 0 0`,
                    }}
                  >
                    Every school run, on the record.
                  </h1>
                </Reveal>
                <Reveal index={2}>
                  <p className="text-lg" style={{ color: darkTheme.text.secondary, margin: `${spacing.lg} 0 0` }}>
                    For schools: Wassel puts the transport office, drivers and parents on one shared
                    view of the morning, so every ride can be accounted for.
                  </p>
                </Reveal>
                <Reveal index={3}>
                  <CtaLink href="/login" style={{ marginTop: spacing.xl }}>
                    Sign in
                  </CtaLink>
                </Reveal>
              </div>
            </div>
          </AmbientVideo>
        </section>

        <Section id="problem-title">
          <SectionHeader
            id="problem-title"
            eyebrow="The problem"
            title="Schools answer for rides they can't see."
            takeaway="Most school transport still runs on hand-drawn routes and phone calls."
          />
          <ul
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ ...LIST_RESET, gap: spacing.md, margin: `${spacing["2xl"]} 0 0` }}
          >
            {PROBLEMS.map((problem, i) => (
              <li key={problem}>
                <Reveal index={i + 1} className="h-full">
                  <Card
                    className="flex h-full text-lg"
                    style={{
                      gap: spacing.md,
                      backgroundColor: darkTheme.surface.recede,
                      boxShadow: "none",
                      color: darkTheme.text.secondary,
                    }}
                  >
                    <span aria-hidden="true" style={{ color: darkTheme.text.muted }}>
                      &ndash;
                    </span>
                    {problem}
                  </Card>
                </Reveal>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="solution-title">
          <SectionHeader
            id="solution-title"
            eyebrow="How Wassel helps"
            title="One shared view of every school run."
            takeaway="Wassel is being built around three commitments."
          />
          <ul
            className="grid grid-cols-1 md:grid-cols-3"
            style={{ ...LIST_RESET, gap: spacing.lg, margin: `${spacing["2xl"]} 0 0` }}
          >
            {COMMITMENTS.map(({ title, line, Icon }, i) => (
              <li key={title}>
                <Reveal index={i + 1} className="h-full">
                  <Card className="h-full">
                    <span
                      className="flex items-center justify-center"
                      style={{
                        width: spacing["2xl"],
                        height: spacing["2xl"],
                        borderRadius: radius.lg,
                        backgroundColor: darkTheme.background.glowPrimary,
                        color: colors.primary[300],
                      }}
                    >
                      <Icon size={iconSize.md} />
                    </span>
                    <h3 className="text-lg" style={{ ...CARD_TITLE_STYLE, margin: `${spacing.lg} 0 0` }}>
                      {title}
                    </h3>
                    <p className="text-base" style={{ margin: `${spacing.sm} 0 0`, color: darkTheme.text.secondary }}>
                      {line}
                    </p>
                  </Card>
                </Reveal>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="roles-title">
          <SectionHeader
            id="roles-title"
            eyebrow="Who it's for"
            title="One record, three seats."
            takeaway="The school, the driver and the parent each see the part of the morning they are responsible for."
          />
          <ul
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ ...LIST_RESET, gap: spacing.lg, margin: `${spacing["2xl"]} 0 0` }}
          >
            {ROLES.map(({ role, title, line, image, video }, i) => (
              <li key={role} className={i === 0 ? "md:col-span-2 lg:col-span-1" : undefined}>
                <Reveal index={i + 1} className="h-full">
                  <Card className="flex h-full flex-col overflow-hidden" style={{ padding: 0 }}>
                    {video ? (
                      <AmbientVideo
                        src="/landing/head-of-transport"
                        poster="/landing/head-of-transport-poster.webp"
                        fallbackImage={image}
                        sizes={ROLE_IMAGE_SIZES}
                        className="aspect-[16/10] md:aspect-[21/9] lg:aspect-[16/10]"
                      />
                    ) : (
                      <div className="relative aspect-[16/10]">
                        <Image src={image} alt="" fill sizes={ROLE_IMAGE_SIZES} className="object-cover" />
                      </div>
                    )}
                    <div style={{ padding: spacing.lg }}>
                      <p
                        className="text-xs font-medium uppercase tracking-wider"
                        style={{ color: colors.accent[300], margin: 0 }}
                      >
                        {role}
                      </p>
                      <h3 className="text-lg" style={{ ...CARD_TITLE_STYLE, margin: `${spacing.xs} 0 0` }}>
                        {title}
                      </h3>
                      <p className="text-base" style={{ margin: `${spacing.sm} 0 0`, color: darkTheme.text.secondary }}>
                        {line}
                      </p>
                    </div>
                  </Card>
                </Reveal>
              </li>
            ))}
          </ul>
        </Section>

        <section aria-labelledby="closing-title" className="relative isolate flex min-h-[70vh] items-center">
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <Image src="/landing/closing-sunrise.webp" alt="" fill sizes="100vw" className="object-cover" />
            <div className="absolute inset-0" style={{ background: landing.ctaScrim }} />
          </div>
          <div className="mx-auto w-full" style={{ ...CONTAINER_STYLE, ...SECTION_PADDING }}>
            <Reveal className="max-w-xl">
              <h2
                id="closing-title"
                style={{
                  ...CARD_TITLE_STYLE,
                  fontSize: landing.display.section.size,
                  lineHeight: landing.display.section.lineHeight,
                  margin: 0,
                }}
              >
                Start tomorrow&apos;s run on Wassel.
              </h2>
              <p className="text-lg" style={{ color: darkTheme.text.secondary, margin: `${spacing.md} 0 0` }}>
                Sign in with the account your school set up for you.
              </p>
              <CtaLink href="/login" style={{ marginTop: spacing.xl }}>
                Sign in
              </CtaLink>
            </Reveal>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${darkTheme.surface.cardBorder}` }}>
        <div
          className="mx-auto flex items-center text-sm"
          style={{ ...CONTAINER_STYLE, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm, color: darkTheme.text.muted }}
        >
          <BrandMark size={spacing.lg} />
          <span className="font-bold tracking-wide" style={{ color: darkTheme.text.primary }}>
            Wassel
          </span>
          <span>&copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </>
  );
}
