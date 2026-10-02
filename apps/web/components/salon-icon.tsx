import type { SVGProps } from "react";
export type SalonIconName = "dashboard" | "brush" | "clients" | "calendar" | "finance" | "reports" | "team" | "settings" | "search" | "plus" | "arrow" | "clock" | "home";
const paths: Record<SalonIconName, string> = {
 dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
 brush: "M4 20l9-11 4 4-11 9z M13 9l3-5 5-3-1 6-3 6 M16 4l4 3",
 clients: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3z M17 4a4 4 0 0 1 0 8 M19 15a6 6 0 0 1 3 6",
 team: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a7 7 0 0 1 14 0v3z M17 4a4 4 0 0 1 0 8 M19 15a6 6 0 0 1 3 6",
 calendar: "M4 5h16v16H4z M4 10h16 M8 2v6 M16 2v6",
 finance: "M4 21V12 M9 21V6 M14 21V10 M19 21V2",
 reports: "M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h6",
 settings: "M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
 search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
 plus: "M12 4v16 M4 12h16", arrow: "M4 12h16 M14 6l6 6-6 6",
 clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 3",
 home: "M2 10l10-8 10 8 M5 8v14h14V8 M9 22v-8h6v8",
};
export function SalonIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: SalonIconName }) {
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
