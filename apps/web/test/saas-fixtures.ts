import type { EntitlementSnapshot } from "@/lib/saas/model";
import { capability } from "@/lib/saas/model";
import type { ActiveTenantContext } from "@/lib/tenant/context";
export function saasFixture() {
  const context: ActiveTenantContext = { membership_id: "f7000000-0000-4000-8000-000000000111", organization_id: "f7000000-0000-4000-8000-000000000001", organization_name: "Synthetic SaaS organization", location_id: "f7000000-0000-4000-8000-000000000011", location_name: "Synthetic location", role: "owner", membership_status: "active", permissions: ["saas.entitlements.read", "saas.subscription.view", "saas.subscription.manage", "saas.usage.view"] };
  const snapshot: EntitlementSnapshot = { organization_id: context.organization_id, location_id: context.location_id, version: 1, status: "ACTIVE", management_allowed: true,
    plan: { id: "f7000000-0000-4000-8000-000000000201", code: "PLAN_A", label: "PLAN_A", development_only: true, version_id: "f7000000-0000-4000-8000-000000000202", version: 1 },
    subscription: { status: "ACTIVE", version: 1, subscription_id: "f7000000-0000-4000-8000-000000000301", plan_version_id: "f7000000-0000-4000-8000-000000000202", creation_allowed: true, effective_from: "2026-10-01T00:00:00Z", effective_until: null, trial_end: null, grace_end: null },
    entitlements: capability.options.map(c => ({ capability: c, configured: true, enabled: true, creation_allowed: true, reason: null })),
    period: { id: "f7000000-0000-4000-8000-000000000401", start: "2026-10-03T03:00:00Z", end: "2026-11-03T03:00:00Z" },
    quotas: [{ code: "ACTIVE_MEMBERS", configured: true, used: "4", limit: "5", status: "AVAILABLE" }, { code: "STORAGE_BYTES", configured: true, used: null, limit: null, status: "UNKNOWN" }],
    observed_at: "2026-10-14T12:00:00Z", diagnostics: { provider_rejected: 0, quota_rejections: 0, subscription_rejections: 0, usage_projection_mismatch: false } };
  return { context, snapshot };
}
