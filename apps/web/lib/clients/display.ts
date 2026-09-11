/** Birth dates are calendar dates; timestamps use the viewer's time zone. */
export function formatClientDate(value: string, timeZone?: string) {
  const calendarDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(value).toLocaleDateString("tr-TR", calendarDate ? { timeZone: "UTC" } : timeZone ? { timeZone } : undefined);
}
