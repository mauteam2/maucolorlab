import type { HairSnapshot } from "./contracts";
import { hairTr as t } from "@/lib/i18n/hair-tr";
export type Assessment = HairSnapshot["core"];
export type Evidence = HairSnapshot["history"]["items"][number]["evidence"];
export const formatHairDate = (value: string, dateOnly = false) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", ...(dateOnly ? {} : { timeStyle: "short" as const }), timeZone: "Europe/Istanbul" }).format(new Date(dateOnly ? value + "T12:00:00Z" : value));
export function displayValue(field: string, item: { state: string; value: string | number | null }) {
 if (item.state !== "KNOWN") return t.states[item.state as keyof typeof t.states];
 if (typeof item.value === "number") return field === "grey_ratio" ? new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 }).format(item.value) : new Intl.NumberFormat("tr-TR").format(item.value);
 return ["thickness", "density", "porosity", "elasticity"].includes(field) ? t.values[item.value as keyof typeof t.values] : item.value;
}
export function regionName(snapshot: HairSnapshot, id: string | null) {
 if (id === null) return t.whole;
 const region = snapshot.regions.find(r => r.id === id)!;
 return region.label ? `${t.regionTypes[region.type]} · ${region.label}` : t.regionTypes[region.type];
}
export function currentObservations(snapshot: HairSnapshot) {
 return [snapshot.core, ...snapshot.regions.map(r => r.assessment)].flatMap(a => a.state === "ASSESSED" ? [a.observation] : []).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
}
