"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Button, ButtonLink } from "@/components/ui/Button";
import { RouteIcon } from "@/components/ui/icons";
import { ToastViewport, useToastQueue } from "@/components/ui/Toast";
import { createRoute, listRoutes, updateRoute, type RouteInput, type RouteSummary } from "@/lib/api/routes";
import { AddRouteForm } from "./AddRouteForm";
import { RouteListItem } from "./RouteListItem";
import { RouteListSkeleton } from "./RouteListSkeleton";
import { colors, darkTheme, radius, sizing, spacing } from "@/styles/tokens";

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const { toasts, pushToast } = useToastQueue();

  const loadRoutes = useCallback(async () => {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      const data = await listRoutes();
      setRoutes(data);
    } catch {
      setLoadError("Couldn't load routes. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  async function handleCreate(data: RouteInput) {
    const route = await createRoute(data);
    setRoutes((prev) => [...prev, route]);
    pushToast(`${route.name} created.`);
  }

  async function handleEdit(routeId: string, data: RouteInput) {
    const route = await updateRoute(routeId, data);
    setRoutes((prev) => prev.map((candidate) => (candidate.id === routeId ? route : candidate)));
    pushToast(`${route.name} saved.`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <main
        className="mx-auto flex flex-col"
        style={{ padding: spacing.xl, gap: spacing.xl, maxWidth: sizing.pageMaxWidth }}
      >
        <header className="flex items-start justify-between flex-wrap" style={{ gap: spacing.md }}>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: darkTheme.text.primary }}>
              Routes
            </h1>
            <p className="text-sm" style={{ color: darkTheme.text.secondary }}>
              See every morning pickup route, its vehicle, driver and seats left.
            </p>
          </div>
          <div className="flex flex-wrap items-center" style={{ gap: spacing.sm }}>
            <ButtonLink variant="secondary" href="/head-of-transport/routes/generate">
              Generate routes
            </ButtonLink>
            <AddRouteForm onAdd={handleCreate} disabled={isLoading || !!loadError} />
          </div>
        </header>

        <section aria-labelledby="route-list-heading">
          <div className="flex items-center" style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center flex-shrink-0 rounded-full"
              style={{
                width: sizing.sectionBadge,
                height: sizing.sectionBadge,
                backgroundColor: darkTheme.status.liveBadgeBg,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="2" fill={colors.success[500]} />
                <circle cx="7" cy="7" r="5" stroke={colors.success[500]} strokeOpacity="0.5" fill="none" />
              </svg>
            </span>
            <h2
              id="route-list-heading"
              className="text-lg font-semibold"
              style={{ color: darkTheme.text.primary }}
            >
              All routes
            </h2>
          </div>
          <div
            aria-hidden="true"
            style={{
              height: "1px",
              background: `linear-gradient(90deg, ${darkTheme.surface.cardBorder}, transparent)`,
              marginBottom: spacing.md,
            }}
          />

          {isLoading && (
            <>
              <span className="sr-only" role="status">
                Loading routes…
              </span>
              <RouteListSkeleton />
            </>
          )}

          {loadError && (
            <div className="flex flex-col items-start" style={{ gap: spacing.sm }}>
              <p role="alert" className="text-sm" style={{ color: colors.error[500] }}>
                {loadError}
              </p>
              <Button variant="secondary" onClick={loadRoutes}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !loadError && routes.length === 0 && (
            <div
              className="flex flex-col items-center text-center"
              style={{
                padding: spacing.xl,
                border: `1px dashed ${darkTheme.surface.cardBorder}`,
                borderRadius: radius.lg,
                backgroundColor: darkTheme.surface.emptyState,
              }}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center"
                style={{
                  width: sizing.emptyStateBadge,
                  height: sizing.emptyStateBadge,
                  borderRadius: radius.full,
                  backgroundColor: darkTheme.surface.emptyStateBadge,
                  color: darkTheme.text.muted,
                  marginBottom: spacing.md,
                }}
              >
                <RouteIcon size={24} />
              </span>
              <p
                className="text-sm font-medium"
                style={{ color: darkTheme.text.primary, marginBottom: spacing.xs }}
              >
                No routes yet
              </p>
              <p className="text-sm" style={{ color: darkTheme.text.muted, maxWidth: sizing.emptyStateText }}>
                Create your first route using the button above to get started.
              </p>
            </div>
          )}

          {!isLoading && !loadError && routes.length > 0 && (
            <ul
              role="list"
              className="flex flex-col"
              style={{ gap: spacing.sm, padding: 0, margin: 0 }}
            >
              <AnimatePresence initial={false}>
                {routes.map((route) => (
                  <RouteListItem key={route.id} route={route} onEdit={handleEdit} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>

      <ToastViewport toasts={toasts} />
    </MotionConfig>
  );
}
