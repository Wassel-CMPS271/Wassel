// Accepted SCRUM-267 contract (#146). The optional LATE extension is pinned to
// unmerged SCRUM-268 #158 at 7baf727 and is disabled by the production client.
import { request } from "./client";
export interface InboxEvent {
  id: string;
  type: "PICKED_UP" | "DROPPED_OFF" | "NOT_PRESENT" | "LATE";
  studentId: string;
  studentName: string;
  runId: string;
  direction: "MORNING" | "AFTERNOON";
  createdAt: string;
  readAt: string | null;
}
function event(value: unknown, allowLate: boolean): InboxEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid inbox entry");
  const r = value as Record<string, unknown>;
  if (!["id", "studentId", "studentName", "runId"].every(k => typeof r[k] === "string" && r[k] !== "")
    || !["PICKED_UP", "DROPPED_OFF", "NOT_PRESENT", ...(allowLate ? ["LATE"] : [])].includes(String(r.type))
    || !["MORNING", "AFTERNOON"].includes(String(r.direction))
    || typeof r.createdAt !== "string" || !Number.isFinite(Date.parse(r.createdAt))
    || (r.readAt !== null && (typeof r.readAt !== "string" || !Number.isFinite(Date.parse(r.readAt))))) throw new Error("Invalid inbox entry");
  return r as unknown as InboxEvent;
}
export function createParentInboxApi({ allowLate = false }: { allowLate?: boolean } = {}) { return {
  async list(unread = false): Promise<InboxEvent[]> {
    const result = await request<unknown>(`/api/parent/inbox${unread ? "?unread=true" : ""}`);
    if (!Array.isArray(result)) throw new Error("Invalid inbox list");
    const rows = result.map(value => event(value, allowLate));
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate inbox entry");
    return rows;
  },
  async unreadCount(): Promise<number> {
    const r = await request<{ count?: unknown }>("/api/parent/inbox/unread-count");
    if (!r || !Number.isSafeInteger(r.count) || Number(r.count) < 0) throw new Error("Invalid unread count");
    return Number(r.count);
  },
  async markRead(id: string): Promise<InboxEvent> {
    const saved = event(await request<unknown>(`/api/parent/inbox/${encodeURIComponent(id)}/read`, { method: "POST" }), allowLate);
    if (saved.id !== id || saved.readAt === null) throw new Error("Invalid read receipt");
    return saved;
  },
  async markAllRead(): Promise<void> { await request("/api/parent/inbox/read-all", { method: "POST" }); },
}; }
export const parentInboxApi = createParentInboxApi();
export type ParentInboxApi = typeof parentInboxApi;
