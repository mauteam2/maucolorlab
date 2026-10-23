import type { ReactNode } from "react";
import Link from "next/link";
import { SalonIcon, type SalonIconName } from "./salon-icon";

export type SignalTone = "neutral" | "success" | "warning" | "risk" | "unknown";
export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: SignalTone }) {
 return <span className="ui-status" data-tone={tone}><span aria-hidden="true" className="ui-status-mark"/>{children}</span>;
}
export function TechnicalNotice({ title, children, tone = "unknown" }: { title: string; children: ReactNode; tone?: SignalTone }) {
 return <aside className="ui-notice" data-tone={tone}><strong>{title}</strong><div>{children}</div></aside>;
}
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
 return <div className="ui-empty"><span className="ui-eyebrow">Çalışma alanı</span><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function LoadingState({ label }: { label: string }) {
 return <div className="ui-loading" role="status"><span>{label}</span><div aria-hidden="true"><i/><i/><i/></div></div>;
}
export function ActionItem({ href, title, children, icon = "arrow" }: { href: string; title: string; children: ReactNode; icon?: SalonIconName }) {
 return <Link prefetch={false} href={href} className="ui-action"><SalonIcon name={icon}/><span><strong>{title}</strong><small>{children}</small></span><span aria-hidden="true">↗</span></Link>;
}
/** This displays workflow position, never authority to bypass a server gate. */
export function WorkflowRail({ current, steps }: { current: number; steps: readonly string[] }) {
 return <ol className="ui-workflow" aria-label="Çalışma akışı">{steps.map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined} data-complete={index < current}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{label}</li>)}</ol>;
}
