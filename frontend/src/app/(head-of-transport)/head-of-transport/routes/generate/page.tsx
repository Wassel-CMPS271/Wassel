"use client";

// Generate all routes (SCRUM-224, built on SCRUM-207): one request plans
// every route for the school, which can take up to about 20 seconds. The
// answer is a proposal that changes nothing until it is applied; Apply writes
// every planned route at once, Discard drops it. The backend answers handled
// here are in docs/contracts/routing.md: a 409 on generate (the school's
// arrival time isn't set, or another generation is running), a 409 on apply
// (the data changed; the proposal stays so it can be discarded) and a 404 on
// apply or discard (the proposal is gone).

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { MotionConfig } from "framer-motion";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { ApiError } from "@/lib/api/errors";
import {
  applyGeneration,
  discardGeneration,
  generateRoutes,
  type FleetProposal,
  type RouteSummary,
} from "@/lib/api/routes";
import { colors, darkTheme, iconSize, sizing, spacing } from "@/styles/tokens";
import {
  FleetProposalView,
  ROUTES_HREF,
  plural,
  type GenerationAction,
  type ProposalError,
} from "./FleetProposalView";

const GENERIC_ERROR = "Something went wrong. Please try again.";
// A generate 409 has two causes, and the backend's detail says which.
const CANT_GENERATE = "Routes can't be generated right now.";
const PROPOSAL_GONE = "This proposal is gone. It was replaced, applied or discarded.";
const DATA_CHANGED =
  "The data changed since this proposal was made, so nothing was applied. Generate again, or discard this proposal.";

// Tighter page padding on phones, as on the route page.
const pageStyle = {
  "--page-pad-phone": spacing.md,
  "--page-pad": spacing.xl,
  gap: spacing.xl,
  maxWidth: sizing.pageMaxWidth,
} as CSSProperties;

const linkClass =
  "inline-flex items-center self-start text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-md";

interface WrittenRoute {
  name: string;
  routeId?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "generating"; startedAt: number }
  | { kind: "proposal"; proposal: FleetProposal; busy?: GenerationAction; error?: ProposalError; stale?: boolean }
  | { kind: "applied"; written: WrittenRoute[] }
  | { kind: "failed"; message: string; detail?: string; retryLabel: "Try again" | "Generate again" };

// The apply answer is every route of the school; the proposal's routes are
// found in it by vehicle, since a new route has no id in the proposal.
function writtenRoutes(proposal: FleetProposal, routes: RouteSummary[]): WrittenRoute[] {
  return proposal.routes.map((planned) => {
    const saved = routes.find((route) => route.vehicle.id === planned.vehicle.id);
    return { name: saved?.name ?? planned.name, routeId: saved?.id };
  });
}

function elapsedText(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

export default function GenerateRoutesPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  // Set synchronously, so a double click can't start a second request before
  // the disabled button re-renders.
  const inFlightRef = useRef(false);
  // Bumped by every request and on leaving the page; an answer that arrives
  // after it changed is dropped, so leaving mid-generation updates nothing.
  const requestIdRef = useRef(0);
  const focusGenerateRef = useRef(false);

  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const proposalHeadingRef = useRef<HTMLHeadingElement>(null);
  const appliedHeadingRef = useRef<HTMLHeadingElement>(null);
  const failedRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      requestIdRef.current++;
    },
    [],
  );

  const startedAt = phase.kind === "generating" ? phase.startedAt : undefined;
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const shownProposal = phase.kind === "proposal" ? phase.proposal : undefined;
  useEffect(() => {
    if (shownProposal) proposalHeadingRef.current?.focus();
  }, [shownProposal]);

  useEffect(() => {
    if (phase.kind === "applied") appliedHeadingRef.current?.focus();
    if (phase.kind === "failed") failedRef.current?.focus();
    if (phase.kind === "idle" && focusGenerateRef.current) {
      focusGenerateRef.current = false;
      generateButtonRef.current?.focus();
    }
  }, [phase.kind]);

  const generate = useCallback(async () => {
    if (inFlightRef.current) return;
    const requestId = ++requestIdRef.current;
    inFlightRef.current = true;
    setAnnouncement("");
    setElapsed(0);
    setPhase({ kind: "generating", startedAt: Date.now() });
    try {
      const proposal = await generateRoutes();
      if (requestId !== requestIdRef.current) return;
      setPhase({ kind: "proposal", proposal });
      setAnnouncement(
        proposal.id === null
          ? "No route could be planned, so there is nothing to apply."
          : `Proposal ready: ${plural(proposal.routes.length, "route")}, ${plural(proposal.unplaced.length, "student")} not placed. Nothing changes until you apply it.`,
      );
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const isConflict = error instanceof ApiError && error.status === 409;
      setPhase({
        kind: "failed",
        message: isConflict ? CANT_GENERATE : GENERIC_ERROR,
        detail: isConflict ? error.message : undefined,
        retryLabel: "Try again",
      });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Apply or Discard. A 404 means the proposal is gone: generate again. A 409
  // on apply means the data changed since it was made: nothing was written
  // and the proposal stays, so it can still be discarded, but not applied.
  async function settle(action: GenerationAction) {
    if (phase.kind !== "proposal" || !phase.proposal.id || inFlightRef.current) return;
    const { proposal, stale } = phase;
    const proposalId = phase.proposal.id;
    const requestId = ++requestIdRef.current;
    inFlightRef.current = true;
    setAnnouncement(action === "apply" ? "Applying the proposal…" : "Discarding the proposal…");
    setPhase({ kind: "proposal", proposal, stale, busy: action });
    try {
      if (action === "apply") {
        const routes = await applyGeneration(proposalId);
        if (requestId !== requestIdRef.current) return;
        setPhase({ kind: "applied", written: writtenRoutes(proposal, routes) });
        setAnnouncement(`${plural(proposal.routes.length, "route")} written.`);
      } else {
        await discardGeneration(proposalId);
        if (requestId !== requestIdRef.current) return;
        focusGenerateRef.current = true;
        setPhase({ kind: "idle" });
        setAnnouncement("Proposal discarded. Nothing was changed.");
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      if (error instanceof ApiError && error.status === 404) {
        setPhase({ kind: "failed", message: PROPOSAL_GONE, retryLabel: "Generate again" });
      } else if (action === "apply" && error instanceof ApiError && error.status === 409) {
        setPhase({ kind: "proposal", proposal, stale: true, error: { message: DATA_CHANGED, detail: error.message } });
      } else {
        setPhase({ kind: "proposal", proposal, stale, error: { message: GENERIC_ERROR } });
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  const showGenerate = phase.kind === "idle" || phase.kind === "generating";

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto w-full flex flex-col p-[var(--page-pad-phone)] sm:p-[var(--page-pad)]"
        style={pageStyle}
      >
        <Link
          href={ROUTES_HREF}
          className={linkClass}
          style={{ gap: spacing.xs, color: darkTheme.text.secondary, outlineColor: colors.primary[400] }}
        >
          <ArrowLeftIcon size={iconSize.sm} />
          Back to routes
        </Link>

        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>

        <header className="flex flex-col" style={{ gap: spacing.xs }}>
          <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
            Generate routes
          </h1>
          <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
            Plans every morning route for the school from its active students and vehicles. You see the
            proposal first; nothing changes until you apply it.
          </p>
        </header>

        {showGenerate && (
          <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
            <Button ref={generateButtonRef} disabled={phase.kind === "generating"} onClick={generate}>
              {phase.kind === "generating" ? "Generating…" : "Generate routes"}
            </Button>
          </div>
        )}

        {/* Always in the page, so the message is announced when it fills in.
            The elapsed time is hidden from screen readers so it isn't read out
            every second. */}
        <div role="status" className="flex flex-col" style={{ gap: spacing.xs }}>
          {phase.kind === "generating" && (
            <>
              <p className="text-sm" style={{ color: darkTheme.text.primary }}>
                Generating routes. This can take up to about 20 seconds.
              </p>
              <p aria-hidden="true" className="text-sm" style={{ color: darkTheme.text.secondary }}>
                Elapsed: {elapsedText(elapsed)}
              </p>
            </>
          )}
        </div>

        {phase.kind === "failed" && (
          <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
            <div ref={failedRef} role="alert" tabIndex={-1} className="flex flex-col" style={{ gap: spacing.xs }}>
              <p className="text-sm" style={{ color: colors.error[500] }}>
                {phase.message}
              </p>
              {phase.detail && (
                <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
                  {phase.detail}
                </p>
              )}
            </div>
            <Button onClick={generate}>{phase.retryLabel}</Button>
          </div>
        )}

        {phase.kind === "proposal" && (
          <FleetProposalView
            proposal={phase.proposal}
            headingRef={proposalHeadingRef}
            busy={phase.busy}
            error={phase.error}
            stale={phase.stale}
            onApply={() => settle("apply")}
            onDiscard={() => settle("discard")}
            onGenerateAgain={generate}
          />
        )}

        {phase.kind === "applied" && (
          <section aria-labelledby="applied-heading" className="flex flex-col" style={{ gap: spacing.sm }}>
            <h2
              ref={appliedHeadingRef}
              id="applied-heading"
              tabIndex={-1}
              className="text-lg font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              {plural(phase.written.length, "route")} written
            </h2>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              You can still edit any route on its own page.
            </p>
            <ul role="list" className="flex flex-col" style={{ gap: spacing.xs, padding: 0, margin: 0 }}>
              {phase.written.map((route, index) => (
                <li key={route.routeId ?? `written-${index}`} className="list-none">
                  {route.routeId ? (
                    <Link
                      href={`${ROUTES_HREF}/${route.routeId}`}
                      className={linkClass}
                      style={{ color: colors.primary[300], outlineColor: colors.primary[400], minHeight: sizing.tapTarget }}
                    >
                      {route.name}
                    </Link>
                  ) : (
                    <span className="text-sm" style={{ color: darkTheme.text.secondary }}>
                      {route.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <ButtonLink variant="secondary" href={ROUTES_HREF} className="self-start">
              Back to routes list
            </ButtonLink>
          </section>
        )}
      </main>
    </MotionConfig>
  );
}
