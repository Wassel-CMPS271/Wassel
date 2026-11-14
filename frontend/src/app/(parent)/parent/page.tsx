"use client";
import { parentInboxApi } from "@/lib/api/parentInbox";
import { ParentInboxHome } from "./ParentInboxHome";
// SCRUM-267 is accepted. SCRUM-268 preferences/late alerts stay explicitly gated.
export default function ParentPage() { return <ParentInboxHome api={parentInboxApi} />; }
