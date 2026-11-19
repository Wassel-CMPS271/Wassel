"use client";
import { getBusLocation } from "@/lib/api/parentTracking";
import { ParentTrackingHome } from "./ParentTrackingHome";
// GPS and ETA use the accepted SCRUM-261/262 child bus-location endpoint.
export default function ParentPage() { return <ParentTrackingHome api={getBusLocation} etaEnabled />; }
