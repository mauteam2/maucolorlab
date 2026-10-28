import type { RegionalColorTarget } from "@/lib/color/target";

/** Display pigments do not exist here: these are original, illustrative screen colors.
 * This one-way adapter consumes target data. No engine/service may import it. */
export type DisplayDirection = { kind: "ILLUSTRATIVE"; shadow: string; body: string; light: string } | { kind: "UNKNOWN" };
const neutralDepth = ["#211c1e", "#2e2425", "#3e2d29", "#50372d", "#674933", "#816043", "#9c7c54", "#baa074", "#d1bd93", "#e3d4b0"];
const toneDirection: Record<string, readonly [number, number, number]> = {
 NEUTRAL: [0, 0, 0], ASH_COOL: [-9, -3, 9], GOLD_WARM: [14, 6, -13], COPPER: [25, -6, -20], RED: [21, -26, -10], VIOLET: [3, -24, 18], BLUE: [-22, -12, 22], GREEN: [-22, 3, -13],
};
const rgb = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
const hex = (values: number[]) => "#" + values.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
export function displaySwatch(level: number | null, tones: readonly string[] = ["NEUTRAL"]): DisplayDirection {
 if (level === null || !Number.isFinite(level) || level < 1 || level > 10 || !tones.length || tones.some(t => !(t in toneDirection))) return { kind: "UNKNOWN" };
 const lower = Math.floor(level) - 1, upper = Math.min(9, lower + 1), fraction = level - Math.floor(level);
 const base = rgb(neutralDepth[lower]!).map((v, i) => v + (rgb(neutralDepth[upper]!)[i]! - v) * fraction);
 const adjusted = base.map((v, i) => v + tones.reduce((sum, t) => sum + toneDirection[t]![i]!, 0) / tones.length);
 return { kind: "ILLUSTRATIVE", shadow: hex(adjusted.map(v => v * .68)), body: hex(adjusted), light: hex(adjusted.map(v => v + 25)) };
}
export function targetDisplaySwatch(target: RegionalColorTarget): DisplayDirection {
 if (target.preserve || target.toneFamily === null) return { kind: "UNKNOWN" };
 return displaySwatch(target.level, target.toneFamily === "MIXED" ? target.mixedFamilies : [target.toneFamily]);
}
