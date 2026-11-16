"use client";

// The reassign panel's logic (SCRUM-274, on SCRUM-264's endpoint): the eligible drivers, the run's
// reassignment history and the POST. One change gives the route to the new driver from now on (both of
// today's runs), so the screen says so; the 200 (already that driver) and 201 (changed) answers can't be
// told apart through request(), and both are a success here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDrivers, type Driver } from "@/lib/api/drivers";
import { ApiError, ApiValidationError } from "@/lib/api/errors";
import { listRoutes, type RouteSummary } from "@/lib/api/routes";
import {
  getRunReassignments,
  reassignRun,
  type ReassignInput,
  type Reassignment,
  type RunSummary,
} from "@/lib/api/runs";
import { eligibleDrivers } from "./eligibleDrivers";

export const REASON_MAX_LENGTH = 200;

const GENERIC_ERROR = "Something went wrong. Please try again.";

export type ReassignField = "driverId" | "fromDriverId" | "reason";

export interface ReassignFailure {
  // The panel's alert.
  message: string;
  // Messages to show next to a field (the driver picker, the reason).
  fieldErrors: Partial<Record<ReassignField, string>>;
  // The run changed under the head (gone, finished, someone else's change): read /runs and the history again.
  reloadRuns: boolean;
  // The eligible list was wrong (driver gone, revoked, taken): read drivers and routes again.
  reloadDrivers: boolean;
}

function failure(message: string, options: Partial<Omit<ReassignFailure, "message">> = {}): ReassignFailure {
  return { message, fieldErrors: {}, reloadRuns: false, reloadDrivers: false, ...options };
}

// Maps every answer of POST .../reassignments the contract lists (docs/contracts/runs.md, errors table) to
// what the panel says. Details are matched on the contract's fixed wording; an unknown one is shown as sent.
export function reassignFailure(error: unknown): ReassignFailure {
  if (error instanceof ApiValidationError) {
    const fieldErrors = { ...error.errors } as Partial<Record<ReassignField, string>>;
    // A 409 refused replacement (deactivated, not set up, already on a route) or a 400 missing driverId.
    if (fieldErrors.driverId) {
      return failure("This driver can't take the route. Pick another driver.", { fieldErrors, reloadDrivers: true });
    }
    return failure("Check the highlighted fields and try again.", { fieldErrors });
  }
  if (!(error instanceof ApiError)) return failure(GENERIC_ERROR); // network failure
  const detail = error.message;
  switch (error.status) {
    case 400:
      return failure(GENERIC_ERROR);
    case 401:
      return failure("Your session has expired. Please sign in again.");
    case 403:
      return failure("You don't have permission to reassign drivers.");
    case 404:
      if (detail === "Driver not found.") {
        const message = "That driver no longer exists. Pick another driver.";
        return failure(message, { fieldErrors: { driverId: message }, reloadDrivers: true });
      }
      return failure("This run no longer exists. The list has been refreshed.", { reloadRuns: true });
    case 409: {
      if (detail === "Only today's runs can be reassigned.") {
        return failure("Only today's runs can be reassigned.", { reloadRuns: true });
      }
      if (/^Run is FINISHED\b/.test(detail)) {
        return failure("This run has already finished, so its driver can't be changed.", { reloadRuns: true });
      }
      const now = /^The driver of this run is now (.+?)\. Reload and try again\.$/.exec(detail);
      if (now) {
        return failure(
          `Someone else already changed this run's driver to ${now[1]}. The list has been refreshed; check it before trying again.`,
          { reloadRuns: true, reloadDrivers: true },
        );
      }
      return failure(detail, { reloadRuns: true });
    }
    default:
      return failure(GENERIC_ERROR); // 5xx, 429: safe to retry (a repeat is a 200 and records nothing)
  }
}

export function reassignSuccessMessage(run: RunSummary): string {
  return `${run.driver.firstName} ${run.driver.lastName} now drives ${run.route.name}, from now on, for both of today's runs.`;
}

export interface ReassignPanel {
  // Null while loading or after a failed load.
  candidates: Driver[] | null;
  candidatesFailed: boolean;
  history: Reassignment[] | null;
  historyFailed: boolean;
  submitting: boolean;
  failure: ReassignFailure | null;
  // The run the POST answered with, once it succeeded.
  reassigned: RunSummary | null;
  // Resolves true on success. A second call while one is pending does nothing and resolves false.
  submit: (driverId: string, reason?: string) => Promise<boolean>;
  reloadCandidates: () => Promise<void>;
  reloadHistory: () => Promise<void>;
}

// `run` is the run as the head sees it: its driver is sent as fromDriverId, so the server refuses (409) if
// someone changed it meanwhile. `refreshRuns` is useLivePolling's.
export function useReassign(run: RunSummary, refreshRuns: () => Promise<void>): ReassignPanel {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  const [candidatesFailed, setCandidatesFailed] = useState(false);
  const [history, setHistory] = useState<Reassignment[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failureState, setFailure] = useState<ReassignFailure | null>(null);
  const [reassigned, setReassigned] = useState<RunSummary | null>(null);

  const mounted = useRef(true);
  // Blocks a second submit before the disabled button has rendered.
  const busy = useRef(false);
  // Only the latest load of each kind may write its result.
  const candidatesLoad = useRef(0);
  const historyLoad = useRef(0);

  const runId = run.id;

  const reloadCandidates = useCallback(async () => {
    const load = ++candidatesLoad.current;
    setCandidatesFailed(false);
    try {
      const [driverList, routeList] = await Promise.all([getDrivers(), listRoutes()]);
      if (!mounted.current || load !== candidatesLoad.current) return;
      setDrivers(driverList);
      setRoutes(routeList);
    } catch {
      if (!mounted.current || load !== candidatesLoad.current) return;
      setDrivers(null);
      setRoutes(null);
      setCandidatesFailed(true);
    }
  }, []);

  const reloadHistory = useCallback(async () => {
    const load = ++historyLoad.current;
    setHistoryFailed(false);
    try {
      const list = await getRunReassignments(runId);
      if (!mounted.current || load !== historyLoad.current) return;
      setHistory(list);
    } catch {
      if (!mounted.current || load !== historyLoad.current) return;
      setHistory(null);
      setHistoryFailed(true);
    }
  }, [runId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setHistory(null);
    setFailure(null);
    setReassigned(null);
    void reloadCandidates();
    void reloadHistory();
  }, [reloadCandidates, reloadHistory]);

  const currentDriverId = run.driver.id;
  const candidates = useMemo(
    () => (drivers && routes ? eligibleDrivers(drivers, routes, currentDriverId) : null),
    [drivers, routes, currentDriverId],
  );

  const submit = useCallback(
    async (driverId: string, reason?: string): Promise<boolean> => {
      if (busy.current) return false;
      const trimmed = reason?.trim() ?? "";
      if (trimmed.length > REASON_MAX_LENGTH) {
        const message = `Keep the reason to ${REASON_MAX_LENGTH} characters or fewer.`;
        setFailure(failure(message, { fieldErrors: { reason: message } }));
        return false;
      }
      busy.current = true;
      setSubmitting(true);
      setFailure(null);
      setReassigned(null);
      // A blank reason is left out, not sent as "".
      const input: ReassignInput = { driverId, fromDriverId: currentDriverId };
      if (trimmed) input.reason = trimmed;
      try {
        const updated = await reassignRun(runId, input);
        if (!mounted.current) return true;
        setReassigned(updated);
        // The row's driver, the audit list and who is spare all changed.
        await Promise.all([refreshRuns(), reloadHistory(), reloadCandidates()]);
        return true;
      } catch (error) {
        if (!mounted.current) return false;
        const result = reassignFailure(error);
        setFailure(result);
        if (result.reloadRuns) {
          void refreshRuns();
          void reloadHistory();
        }
        if (result.reloadDrivers) void reloadCandidates();
        return false;
      } finally {
        busy.current = false;
        if (mounted.current) setSubmitting(false);
      }
    },
    [currentDriverId, refreshRuns, reloadCandidates, reloadHistory, runId],
  );

  return {
    candidates,
    candidatesFailed,
    history,
    historyFailed,
    submitting,
    failure: failureState,
    reassigned,
    submit,
    reloadCandidates,
    reloadHistory,
  };
}
