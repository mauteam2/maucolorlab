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
const regionOrder: HairSnapshot["regions"][number]["type"][] = ["ROOT", "MID_LENGTHS", "ENDS", "FACE_FRAME", "CROWN", "NAPE", "BANDED_AREA", "BLEACHED_AREA", "HIGHLIGHTED_AREA", "CUSTOM"];
export function orderedRegions(snapshot: HairSnapshot) {
 return [...snapshot.regions].sort((a, b) => regionOrder.indexOf(a.type) - regionOrder.indexOf(b.type) || a.label?.localeCompare(b.label ?? "", "tr") || a.id.localeCompare(b.id));
}
