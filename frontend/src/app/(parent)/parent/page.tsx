"use client";
import { parentInboxApi } from "@/lib/api/parentInbox";
import { getBusLocation } from "@/lib/api/parentTracking";
import { ParentInboxHome } from "./ParentInboxHome";
// Accepted GPS/ETA and Inbox coexist. Unmerged preferences/LATE remain gated.
export default function ParentPage() { return <ParentInboxHome api={parentInboxApi} trackingApi={getBusLocation} etaEnabled />; }
