// Calendar entries (holidays, half-days) are plain dates, not moments in
// time, so format them in UTC: local-timezone formatting could show the
// previous day.
export function calendarDateParts(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return {
    month: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    day: date.getUTCDate(),
    full: date.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}
