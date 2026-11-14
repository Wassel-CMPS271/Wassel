// Prepared against SCRUM-268 #158 7baf727, docs/contracts/inbox.md.
// Production does not supply this client until the backend is accepted.
import { request } from "./client";
export interface NotificationPreferences {
  pickedUp: boolean;
  droppedOff: boolean;
  notPresent: boolean;
  late: boolean;
  lateAfterMinutes: number;
}
export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object") throw new Error("Invalid notification preferences");
  const r = value as Record<string, unknown>;
  if (!["pickedUp", "droppedOff", "notPresent", "late"].every(k => typeof r[k] === "boolean")
    || !Number.isSafeInteger(r.lateAfterMinutes) || Number(r.lateAfterMinutes) < 5 || Number(r.lateAfterMinutes) > 60) throw new Error("Invalid notification preferences");
  return { pickedUp: r.pickedUp, droppedOff: r.droppedOff, notPresent: r.notPresent, late: r.late, lateAfterMinutes: r.lateAfterMinutes } as NotificationPreferences;
}
const path = "/api/parent/notification-preferences";
export const notificationPreferencesApi = {
  async get(): Promise<NotificationPreferences> { return parseNotificationPreferences(await request<unknown>(path)); },
  async save(value: NotificationPreferences): Promise<NotificationPreferences> {
    const body = parseNotificationPreferences(value);
    return parseNotificationPreferences(await request<unknown>(path, { method: "PUT", body }));
  },
};
export type NotificationPreferencesApi = typeof notificationPreferencesApi;
