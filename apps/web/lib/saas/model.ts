import { z } from "zod";

const id = z.uuid(), time = z.iso.datetime({ offset: true });
export const exactUsage = z.string().regex(/^(0|[1-9]\d{0,18})$/);
export const subscriptionState = z.enum(["UNCONFIGURED", "ACTIVE", "TRIAL", "PAST_DUE", "GRACE", "SUSPENDED", "CANCELLED", "EXPIRED", "TRIAL_EXPIRED"]);
export const capability = z.enum(["COLOR_ENGINE", "BRAND_ADAPTER", "LIVE_SESSION", "CRM", "STOCK", "FINANCE", "COSTING", "COMMISSION", "REPORTING", "AI_GATEWAY"]);
export type Capability = z.infer<typeof capability>;
export const entitlement = z.strictObject({ capability, configured: z.boolean(), enabled: z.boolean(), creation_allowed: z.boolean(), reason: z.string().nullable() });
export const quota = z.strictObject({ code: z.enum(["LOCATIONS", "ACTIVE_MEMBERS", "STORAGE_BYTES", "ENGINE_EXECUTIONS"]), configured: z.boolean(), limit: exactUsage.nullable(), used: exactUsage.nullable(), status: z.enum(["UNKNOWN", "UNCAPPED", "EXCEEDED", "AT_LIMIT", "AVAILABLE"]) });
export const plan = z.strictObject({ id, code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), label: z.string().min(1).max(120), development_only: z.boolean(), version_id: id, version: z.int().positive() });
export const usagePeriod = z.strictObject({ id, start: time, end: time }).refine(p => Date.parse(p.start) < Date.parse(p.end));
export const subscription = z.strictObject({ status: subscriptionState, version: z.int().nonnegative(), subscription_id: id.nullable(), plan_version_id: id.nullable(), creation_allowed: z.boolean(), effective_from: time.nullable(), effective_until: time.nullable(), trial_end: time.nullable(), grace_end: time.nullable() });
export const entitlementSnapshot = z.strictObject({
  organization_id: id, location_id: id, version: z.int().nonnegative(), status: subscriptionState,
  entitlements: entitlement.array().length(10), management_allowed: z.boolean(), plan: plan.nullable(), subscription: subscription.nullable(),
  period: usagePeriod.nullable(), quotas: quota.array().max(4), observed_at: time,
  diagnostics: z.strictObject({ provider_rejected: z.int().nonnegative(), quota_rejections: z.int().nonnegative(), subscription_rejections: z.int().nonnegative(), usage_projection_mismatch: z.boolean() }).nullable(),
}).superRefine((s, ctx) => {
  if (new Set(s.entitlements.map(e => e.capability)).size !== 10 || new Set(s.quotas.map(q => q.code)).size !== s.quotas.length) ctx.addIssue({ code: "custom", message: "Duplicate SaaS definitions" });
  for (const e of s.entitlements) if (e.creation_allowed && (!e.enabled || !e.configured || !["ACTIVE", "TRIAL", "GRACE"].includes(s.status))) ctx.addIssue({ code: "custom", message: "Invalid entitlement authority" });
  for (const q of s.quotas) {
    const expected = !q.configured || q.used === null ? "UNKNOWN" : q.limit === null ? "UNCAPPED" : BigInt(q.used) > BigInt(q.limit) ? "EXCEEDED" : q.used === q.limit ? "AT_LIMIT" : "AVAILABLE";
    if (q.status !== expected) ctx.addIssue({ code: "custom", message: "Invalid quota state" });
  }
  if (!s.management_allowed && (s.plan !== null || s.subscription !== null || s.quotas.length || s.period !== null || s.diagnostics !== null)) ctx.addIssue({ code: "custom", message: "Unexpected account governance fields" });
  if (s.subscription && (s.subscription.version !== s.version || s.subscription.status !== s.status)) ctx.addIssue({ code: "custom", message: "Inconsistent account version" });
});
export type EntitlementSnapshot = z.infer<typeof entitlementSnapshot>;
export const saasCommand = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("REQUEST_CHANGE"), request_id: id, reason: z.string().trim().min(1).max(500) }),
  z.strictObject({ type: z.literal("REBUILD_USAGE") }),
]);
export const saasOperationResult = z.strictObject({ data: z.strictObject({ id }), correlationId: id });
export const saasErrorCodes = ["SAAS_UNCONFIGURED", "SUBSCRIPTION_RESTRICTED", "FEATURE_UNAVAILABLE", "QUOTA_UNKNOWN", "QUOTA_EXCEEDED", "USAGE_PERIOD_UNKNOWN", "STORAGE_METER_UNAVAILABLE", "SAAS_VERSION_CONFLICT", "USAGE_REPLAY_CONFLICT", "PROVIDER_REPLAY_CONFLICT"] as const;
export function saasMessage(code: string) {
  return ({ SAAS_UNCONFIGURED: "Bu çalışma alanının plan yapılandırması henüz tamamlanmadı.", SUBSCRIPTION_RESTRICTED: "Abonelik durumu yeni işlemlere izin vermiyor. Geçmiş kayıtlar korunur.", FEATURE_UNAVAILABLE: "Bu özellik mevcut planda yer almıyor.", QUOTA_EXCEEDED: "Yapılandırılmış kullanım sınırına ulaşıldı. Mevcut kayıtlar korunur.", QUOTA_UNKNOWN: "Kullanım sınırı doğrulanamıyor. Hesap yapılandırmasını kontrol edin.", USAGE_PERIOD_UNKNOWN: "Geçerli kullanım dönemi yapılandırılmamış.", STORAGE_METER_UNAVAILABLE: "Depolama ölçümü henüz yapılandırılmamış.", SAAS_VERSION_CONFLICT: "Hesap durumu değişti. Güncel görünümü yeniden açın." } as Record<string, string>)[code] ?? "Hesap kullanım durumu doğrulanamadı.";
}
export const saasErrorMessages = Object.fromEntries(saasErrorCodes.map(code => [code, saasMessage(code)]));
export const capabilityLabels: Record<Capability, string> = { COLOR_ENGINE: "Color Engine", BRAND_ADAPTER: "Marka uyarlaması", LIVE_SESSION: "Canlı renk oturumu", CRM: "Müşteri ilişkileri", STOCK: "Stok", FINANCE: "Finans", COSTING: "Doğrudan maliyet", COMMISSION: "Komisyon", REPORTING: "Raporlama", AI_GATEWAY: "AI Gateway sınırı" };
