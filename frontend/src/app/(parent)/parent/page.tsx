"use client";
import { parentInboxApi } from "@/lib/api/parentInbox";
import { notificationPreferencesApi } from "@/lib/api/notificationPreferences";
import { getBusLocation } from "@/lib/api/parentTracking";
import { ParentInboxHome } from "./ParentInboxHome";
// Accepted GPS/ETA and Inbox, including SCRUM-268 preferences and LATE events.
export default function ParentPage() { return <ParentInboxHome api={parentInboxApi} preferencesApi={notificationPreferencesApi} trackingApi={getBusLocation} etaEnabled />; }
