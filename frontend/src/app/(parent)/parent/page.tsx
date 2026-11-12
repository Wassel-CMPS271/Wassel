"use client";
import { getBusLocation } from "@/lib/api/parentTracking";
import { ParentTrackingHome } from "./ParentTrackingHome";
// #143 is merged. ETA is deliberately gated until #153 is merged and verified.
export default function ParentPage() { return <ParentTrackingHome api={getBusLocation} etaEnabled={false} />; }
