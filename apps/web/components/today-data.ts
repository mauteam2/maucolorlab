"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { tenantContextSchema, workspaceReference, type ActiveTenantContext } from "@/lib/tenant/context";
import { salonSnapshot, precheckResult, type Appointment, type SalonSnapshot } from "@/lib/salon/model";
import { localDate } from "@/lib/salon/engine";
import { crmAction, page } from "@/lib/crm/model";
import { reportSummary, type ReportSummary } from "@/lib/reporting/model";

export type Preparation = z.infer<typeof precheckResult>;
export type TodayAction = z.infer<typeof crmAction>;
type ReadState<T> = { data: T | null; error: boolean };
const empty = { data: null, error: false };
export function technicalAccess(context: ActiveTenantContext) {
  return ["owner", "manager", "colorist"].includes(context.role) &&
    ["salon.precheck.read", "hair_passport.read", "clients.read"].every(p => context.permissions.includes(p));
}
export function dayAppointments(data: SalonSnapshot, now: string) {
  const day = localDate(now, data.location.timezone);
  return data.appointments.filter(a => localDate(a.start_at, data.location.timezone) === day)
    .sort((a, b) => a.start_at.localeCompare(b.start_at) || a.id.localeCompare(b.id));
}
export function nextAppointment(items: Appointment[], now: string) {
  // Actual workflow status wins over planned time. Never label a booked slot as in service.
  return items.find(a => a.status === "IN_SERVICE") ?? items.find(a => a.status === "ARRIVED") ??
    items.find(a => ["DRAFT", "CONFIRMED"].includes(a.status) && a.end_at > now) ?? null;
}
export function useTodayData(context: ActiveTenantContext) {
  const [salon, setSalon] = useState<ReadState<SalonSnapshot>>(empty);
  const [actions, setActions] = useState<ReadState<{ items: TodayAction[]; has_more: boolean }>>(empty);
  const [report, setReport] = useState<ReadState<ReportSummary>>(empty);
  const [preparation, setPreparation] = useState<Record<string, Preparation | null>>({});
  const [now, setNow] = useState(() => new Date().toISOString());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true, epoch = 0;
    let controller = new AbortController();
    const can = (p: string) => context.permissions.includes(p);
    const hide = () => {
      epoch++; controller.abort(); setSalon(empty); setActions(empty); setReport(empty); setPreparation({});
    };
    async function load() {
      hide();
      if (!alive || document.hidden || !navigator.onLine) return;
      controller = new AbortController();
      const generation = epoch, signal = AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
      const current = () => alive && generation === epoch && !document.hidden && navigator.onLine;
      const read = async (url: string, init?: RequestInit) => {
        const response = await fetch(url, { ...init, cache: "no-store", signal });
        if (response.status === 401) { window.location.replace("/sign-in?reason=SESSION_EXPIRED"); throw new Error(); }
        if (!response.ok) throw new Error();
        const body = await response.json(), ctx = tenantContextSchema.parse(body.context);
        if (workspaceReference(ctx) !== workspaceReference(context) || ctx.organization_id !== context.organization_id) throw new Error();
        return body.data as unknown;
      };
      const loadSalon = async () => {
        try {
          // Bootstrap +/- one UTC day, then select today using the authoritative salon timezone.
          const stamp = new Date(), from = new Date(stamp.getTime() - 86400000).toISOString().slice(0, 10), to = new Date(stamp.getTime() + 86400000).toISOString().slice(0, 10);
          let data = salonSnapshot.parse(await read(`/api/salon?from=${from}&to=${to}`));
          if (data.location.id !== context.location_id || data.location.organization_id !== context.organization_id) throw new Error();
          const day = localDate(data.evaluated_at, data.location.timezone);
          // A dense three-day interval must not hide today's records behind the server page cap.
          if (data.has_more) data = salonSnapshot.parse(await read(`/api/salon?from=${day}&to=${day}`));
          if (data.location.id !== context.location_id || data.location.organization_id !== context.organization_id || data.appointments.some(a => a.organization_id !== context.organization_id || a.location_id !== context.location_id)) throw new Error();
          if (!current()) return;
          setSalon({ data, error: false }); setNow(data.evaluated_at);
          if (!technicalAccess(context)) return;
          const candidates = dayAppointments(data, data.evaluated_at).filter(a => !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(a.status) && (a.colorlab_required || a.hair_passport_required || a.precheck_required));
          const chosen = nextAppointment(candidates, data.evaluated_at);
          const queue = [...(chosen ? [chosen] : []), ...candidates.filter(a => a.id !== chosen?.id)].slice(0, 8);
          // Bounded, two-at-a-time reads; readiness never becomes a dashboard-issued clearance.
          let index = 0;
          await Promise.all([0, 1].map(async () => {
            while (index < queue.length && current()) {
              const appointment = queue[index++]!;
              try {
                const value = precheckResult.parse(await read(`/api/salon/appointments/${appointment.id}/precheck`));
                if (value.appointment_id !== appointment.id || value.appointment_version !== appointment.version) throw new Error();
                if (current()) setPreparation(p => ({ ...p, [appointment.id]: value }));
              } catch { if (current()) setPreparation(p => ({ ...p, [appointment.id]: null })); }
            }
          }));
        } catch { if (current()) setSalon({ data: null, error: true }); }
      };
      const loadActions = async () => {
        try {
          const value = page(crmAction).parse(await read("/api/crm/read", { method: "POST", headers: { "content-type": "application/json", "x-workspace-reference": workspaceReference(context) }, body: JSON.stringify({ operation: "actions", status: "OPEN", limit: 5, offset: 0 }) }));
          if (value.items.some(a => a.organization_id !== context.organization_id || a.location_id !== context.location_id)) throw new Error();
          if (current()) setActions({ data: value, error: false });
        } catch { if (current()) setActions({ data: null, error: true }); }
      };
      const loadReport = async () => {
        try {
          const value = reportSummary.parse(await read("/api/reporting?period=TODAY&kind=OVERVIEW"));
          if (value.organization_id !== context.organization_id || value.location_id !== context.location_id) throw new Error();
          if (current()) setReport({ data: value, error: false });
        } catch { if (current()) setReport({ data: null, error: true }); }
      };
      await Promise.allSettled([can("salon.read") ? loadSalon() : null, can("crm.read") ? loadActions() : null,
        ["owner", "manager"].includes(context.role) && can("reports.read") ? loadReport() : null]);
    }
    void load();
    const visibility = () => { if (document.hidden) hide(); else void load(); };
    const timer = window.setInterval(() => void load(), 60000);
    window.addEventListener("blur", hide); window.addEventListener("focus", load);
    window.addEventListener("offline", hide); window.addEventListener("online", load);
    window.addEventListener("elifora-offline-lock", hide); document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; hide(); clearInterval(timer); window.removeEventListener("blur", hide); window.removeEventListener("focus", load); window.removeEventListener("offline", hide); window.removeEventListener("online", load); window.removeEventListener("elifora-offline-lock", hide); document.removeEventListener("visibilitychange", visibility); };
  }, [context, revision]);
  return { salon, actions, report, preparation, now, refresh: () => setRevision(v => v + 1) };
}
