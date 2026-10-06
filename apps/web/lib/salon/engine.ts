import type { Appointment } from "./model";
import { competencyLevels } from "./model";
export const reservingStates = ["DRAFT", "CONFIRMED", "ARRIVED", "IN_SERVICE"] as const;
export const transitions: Record<Appointment["status"], Appointment["status"][]> = {
 DRAFT: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["ARRIVED", "CANCELLED", "NO_SHOW"], ARRIVED: ["IN_SERVICE", "CANCELLED"], IN_SERVICE: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};
export function competencySatisfies(actual: string | undefined, minimum: string) {
 return actual !== undefined && actual !== "NOT_AUTHORIZED" && competencyLevels.indexOf(actual as typeof competencyLevels[number]) >= competencyLevels.indexOf(minimum as typeof competencyLevels[number]);
}
/** Own completed appointments only; no industry estimate and no AI inference. */
export function durationEstimate(defaultMinutes: number, seconds: number[]) {
 const samples = seconds.filter(v => Number.isFinite(v) && v >= 60 && v <= 12 * 3600).slice(0, 100).sort((a, b) => a - b);
 if (samples.length < 5) return { source: "SERVICE_DEFAULT" as const, sample_count: samples.length, estimated_minutes: defaultMinutes };
 const middle = Math.floor(samples.length / 2), median = samples.length % 2 ? samples[middle]! : (samples[middle - 1]! + samples[middle]!) / 2;
 return { source: "OWN_SALON_MEDIAN" as const, sample_count: samples.length, estimated_minutes: Math.ceil(median / 60) };
}
export function localDate(instant: Date, timezone: string) {
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
 return ["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-");
}
export function localTime(instant: string, timezone: string) {
 return new Intl.DateTimeFormat("tr-TR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}
