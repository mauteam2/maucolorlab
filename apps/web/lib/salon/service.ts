import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { readCaseRisk } from "@/lib/risk/service";
import { readHairPassport } from "@/lib/hair-passport/service";
import { liveSession } from "@/lib/live/model";
import { appointment, salonCommand, salonSnapshot, slotRequest, slotResult, precheckResult, permissionFor } from "./model";
import { competencySatisfies, durationEstimate } from "./engine";
type Context = Awaited<ReturnType<typeof verifiedClientContext>>;
export function salonErrorStatus(code: string) {
 return ["UNAUTHENTICATED", "SESSION_EXPIRED"].includes(code) ? 401 : ["FORBIDDEN", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID"].includes(code) ? 403 : code === "SALON_NOT_FOUND" ? 404 : ["NETWORK_ERROR"].includes(code) ? 503 : ["VALIDATION_FAILED", "INVALID_LOCAL_TIME", "AMBIGUOUS_LOCAL_TIME"].includes(code) ? 400 : 409;
}
async function access(permission: string, reference?: string | null) {
 const ctx = await verifiedClientContext(permission);
 if (reference !== undefined && reference !== workspaceReference(ctx)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 return ctx;
}
async function finish(ctx: Context, permission: string) {
 const current = await access(permission, workspaceReference(ctx));
 if (current.organization_id !== ctx.organization_id) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
}
function unwrap(result: { data: unknown; error: unknown }) {
 if (result.error) throw new AccessError("NETWORK_ERROR", 503);
 const parsed = z.object({ code: z.string().optional(), data: z.unknown().optional() }).safeParse(result.data);
 if (!parsed.success) throw new AccessError("NETWORK_ERROR", 503);
 if (parsed.data.code) throw new AccessError(parsed.data.code, salonErrorStatus(parsed.data.code));
 return parsed.data.data;
}
export async function readSalon(from: string, to: string, correlationId: string, appointmentId?: string) {
 if (!z.iso.date().safeParse(from).success || !z.iso.date().safeParse(to).success || Date.parse(to) < Date.parse(from) || Date.parse(to) - Date.parse(from) > 30 * 86400000 || appointmentId !== undefined && !z.uuid().safeParse(appointmentId).success) throw new AccessError("VALIDATION_FAILED", 400);
 const context = await access("salon.read"), client = await createClient();
 const data = salonSnapshot.parse(unwrap(await client.rpc("salon_snapshot", { p_membership_id: context.membership_id, p_location_id: context.location_id, p_from: from, p_to: to, p_appointment_id: appointmentId ?? null })));
 if (data.location.id !== context.location_id || data.location.organization_id !== context.organization_id || [...data.appointments,...data.staff,...data.resources,...data.exceptions,...data.availability].some(a => a.organization_id !== context.organization_id || a.location_id !== context.location_id) || data.services.some(s=>s.organization_id!==context.organization_id||s.location_id!==null&&s.location_id!==context.location_id) || appointmentId && (data.appointments.length !== 1 || data.appointments[0]!.id !== appointmentId)) throw new AccessError("NETWORK_ERROR", 503);
 await finish(context, "salon.read");
 return { data, context, correlationId };
}
export async function mutateSalon(raw: unknown, correlationId: string, reference: string | null) {
 const parsed = salonCommand.safeParse(raw);if (!parsed.success) throw new AccessError("VALIDATION_FAILED", 400);
 const command = parsed.data, permission = permissionFor(command.type), context = await access(permission, reference), client = await createClient();
 const result = unwrap(await client.rpc("salon_operation", { p_membership_id: context.membership_id, p_location_id: context.location_id, p_command: command, p_correlation_id: correlationId }));
 const data = command.type.startsWith("APPOINTMENT_") || command.type === "LINK_LIVE_SESSION" ? appointment.parse(result) : z.strictObject({ id: z.uuid(), version: z.number().int().positive() }).parse(result);
 if ("organization_id" in data && "location_id" in data && (data.organization_id !== context.organization_id || data.location_id !== context.location_id)) throw new AccessError("NETWORK_ERROR", 503);
 if ("id" in command && data.id !== command.id || command.type === "STAFF_SAVE" && data.id !== command.membership_id || command.type === "HOURS_SAVE" && data.id !== context.location_id) throw new AccessError("NETWORK_ERROR", 503);
 await finish(context, permission);
 return { data, context, correlationId };
}
export async function searchSlots(raw: unknown, correlationId: string, reference: string | null) {
 const q = slotRequest.safeParse(raw);if (!q.success) throw new AccessError("VALIDATION_FAILED", 400);
 const context = await access("salon.read", reference), client = await createClient();
 const data = slotResult.parse(unwrap(await client.rpc("salon_slots", { p_membership_id: context.membership_id, p_location_id: context.location_id, p_request: q.data })));
 await finish(context, "salon.read");return { data, context, correlationId };
}
export async function readPrecheck(id: string, correlationId: string) {
 const ctx = await access("salon.precheck.read");
 const today = new Date().toISOString().slice(0, 10), current = await readSalon(today, today, correlationId, id);
 if (workspaceReference(current.context) !== workspaceReference(ctx)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 const a = current.data.appointments[0]!, s = current.data.services.find(s => s.id === a.service_id), worker = current.data.staff.find(w => w.membership_id === a.staff_membership_id), client = await createClient();
 const history = await client.from("salon_appointments").select("actual_duration_seconds").eq("organization_id", ctx.organization_id).eq("location_id", ctx.location_id).eq("service_id", a.service_id).eq("staff_membership_id", a.staff_membership_id).eq("status", "COMPLETED").not("actual_duration_seconds", "is", null).order("completed_at", { ascending: false }).limit(100);
 if (history.error) throw new AccessError("NETWORK_ERROR", 503);
 const estimate = durationEstimate(s?.base_duration_minutes ?? a.default_duration_minutes, (history.data ?? []).map(r => Number(r.actual_duration_seconds)));
 const data: z.infer<typeof precheckResult> = {
  appointment_id: a.id, appointment_version: a.version, evaluated_at: current.data.evaluated_at, statuses: [], reasons: [], risk: null,
  freshness: { state: "MISSING", updated_at: null }, recovery: "NOT_ASSESSED", complexity: "UNKNOWN", integrity_history: [], recent_technical_history: [], last_formula: null, last_outcome: null,
  duration: { ...estimate, allocated_minutes: a.scheduled_duration_minutes, additional_minutes: Math.max(0, estimate.estimated_minutes - a.scheduled_duration_minutes) }, competencies: worker?.competencies ?? [], recipe_created: false,
 };
 const add = (status: typeof data.statuses[number], reason: string) => { if (!data.statuses.includes(status)) data.statuses.push(status);data.reasons.push(reason); };
 if (!s?.active || s.version !== a.service_version) add("REVIEW_REQUIRED", "SERVICE_VERSION_CHANGED");
 if (!worker?.active || !worker.bookable || worker.membership_status !== "active" || !s?.eligible_membership_ids.includes(a.staff_membership_id)) add("TECHNICAL_ESCALATION", "STAFF_ELIGIBILITY_CHANGED");
 for (const required of s?.capabilities ?? []) {
  const actual = worker?.competencies.find(c => c.code === required.code)?.level;
  if (!competencySatisfies(actual, required.level)) add("TECHNICAL_ESCALATION", `COMPETENCY_REQUIRED:${required.code}:${required.level}`);
  else if (actual === "ASSISTED") add("REVIEW_REQUIRED", `ASSISTED_COMPETENCY:${required.code}`);
 }
 if (a.colorlab_required || a.hair_passport_required || a.precheck_required) {
  if (!ctx.permissions.includes("hair_passport.read") || !ctx.permissions.includes("clients.read")) throw new AccessError("FORBIDDEN", 403);
  try {
   const [risk, passport] = await Promise.all([readCaseRisk(a.client_id, {}, correlationId), readHairPassport(a.client_id, { page_size: 100 }, correlationId)]);
   if (passport.data.passport.client_id !== a.client_id || risk.data.passportId !== passport.data.passport.id || risk.data.passportVersion !== passport.data.passport.version) throw new AccessError("SALON_CONFLICT", 409);
   data.risk = { gate: risk.data.gate.outcome, band: risk.data.overallBand, can_progress: risk.data.gate.canProgress, passport_version: risk.data.passportVersion };
   data.freshness = { state: risk.data.gate.canProgress ? "CURRENT" : "REVIEW_REQUIRED", updated_at: passport.data.passport.updated_at };data.complexity = risk.data.overallBand;
   if (risk.data.requiredInformation.length) add("INFORMATION_REQUIRED", "RISK_INFORMATION_REQUIRED");
   if (risk.data.requiredPhysicalTests.some(t => t.status !== "SATISFIED")) add("TEST_REQUIRED", "RISK_PHYSICAL_TEST_REQUIRED");
   if (risk.data.gate.outcome === "REQUIRE_RECOVERY_REASSESSMENT" || risk.data.hardStops.some(stop=>stop.outcome==="REQUIRE_RECOVERY_REASSESSMENT")) { data.recovery = "REASSESSMENT_REQUIRED";add("RECOVERY_CONSTRAINT", "RISK_RECOVERY_REASSESSMENT"); }
   if (!risk.data.gate.canProgress) add("REVIEW_REQUIRED", `RISK_GATE:${risk.data.gate.outcome}`);
   if (risk.data.overallBand === "HIGH" || risk.data.overallBand === "CRITICAL") add("TECHNICAL_ESCALATION", `RISK_BAND:${risk.data.overallBand}`);
   data.integrity_history = risk.data.dimensions.filter(d => ["HAIR_INTEGRITY", "POROSITY_ELASTICITY"].includes(d.dimension)).flatMap(d => d.reasons.map(r => r.code)).slice(0, 20);
   data.recent_technical_history = passport.data.history.items.filter(h => ["BLEACH_LIGHTENING", "COLOR", "TONER_GLOSS"].includes(h.category)).map(h => ({ id: h.id, category: h.category, date: h.performed_on.state === "UNKNOWN" ? null : h.performed_on.value, date_state: h.performed_on.state }));
   if (passport.data.history.has_more) add("REVIEW_REQUIRED", "HISTORY_SUMMARY_TRUNCATED");
  } catch (e) {
   if (e instanceof AccessError && e.code === "HAIR_PASSPORT_NOT_FOUND") add("INFORMATION_REQUIRED", "HAIR_PASSPORT_MISSING");
   else throw e;
  }
  if (ctx.permissions.includes("live_session.view")) {
   const memory = await client.from("live_sessions").select("payload").eq("organization_id", ctx.organization_id).eq("location_id", ctx.location_id).eq("client_id", a.client_id).eq("status", "COMPLETED").order("completed_at", { ascending: false }).limit(1);
   if (memory.error) throw new AccessError("NETWORK_ERROR", 503);
   if (memory.data?.length) {
    const session = liveSession.parse(memory.data[0]!.payload), recipe = session.recipes.find(r => r.id === session.currentRecipeId)!;
    if (session.clientId !== a.client_id || session.locationId !== ctx.location_id || !session.completedAt || !session.outcome) throw new AccessError("NETWORK_ERROR", 503);
    data.last_formula = { session_id: session.id, recipe_id: recipe.id, label: recipe.result.selected.displayName, color_grams: recipe.result.colorGrams, developer_grams: recipe.result.developerGrams, completed_at: session.completedAt };
    data.last_outcome = { session_id: session.id, assessment: session.outcome.professionalAssessment, actual_duration_seconds: session.actualProcessSeconds, used_grams: session.usage.reduce((n, u) => n + u.usedGrams, 0), waste_grams: session.usage.reduce((n, u) => n + u.wasteGrams, 0) };
   }
  }
 }
 if (data.duration.additional_minutes) add("TIME_WARNING", "OWN_SALON_DURATION_EXCEEDS_ALLOCATION");
 if (!data.statuses.length) data.statuses.push("READY");
 await finish(ctx, "salon.precheck.read");
 // Appointment changes during a technical read cannot produce a current-looking summary.
 const latest = await client.from("salon_appointments").select("version").eq("id", a.id).eq("organization_id", ctx.organization_id).eq("location_id", ctx.location_id).single();
 if (latest.error || latest.data.version !== a.version) throw new AccessError("SALON_CONFLICT", 409);
 await finish(ctx, "salon.precheck.read");return { data: precheckResult.parse(data), context: ctx, correlationId };
}
