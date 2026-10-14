// Node 24 generates the same schemas used by Web runtime validation.
import { writeFileSync } from "node:fs";
import { z } from "../apps/web/node_modules/zod/index.js";
import * as m from "../apps/web/lib/saas/model.ts";
const id = z.uuid(), time = z.iso.datetime({ offset: true });
const schemas = {
  SaaSAccount: z.strictObject({ organization_id: id, version: z.int().nonnegative(), status: m.subscriptionState, created_at: time, activated_at: time.nullable(), suspended_at: time.nullable(), closed_at: time.nullable() }),
  Plan: m.plan, PlanVersion: z.strictObject({ id, plan_id: id, version: z.int().positive(), created_at: time, actor: z.string().min(1).max(160), reason: z.string().min(1).max(500) }),
  Entitlement: m.entitlement, Quota: m.quota, Subscription: m.subscription, SubscriptionState: m.subscriptionState,
  UsageEvent: z.strictObject({ id, organization_id: id, location_id: id.nullable(), period_id: id, category: z.enum(["ENGINE_EXECUTIONS", "STORAGE_BYTES"]), source_domain: z.string().min(1).max(80), source_id: id, quantity: z.string().regex(/^-?[1-9]\d{0,18}$/), occurred_at: time, source_hash: z.string().regex(/^[a-f0-9]{64}$/) }),
  UsagePeriod: m.usagePeriod, UsageSummary: z.strictObject({ organization_id: id, period: m.usagePeriod.nullable(), quotas: m.quota.array().max(4), observed_at: time }),
  EntitlementSnapshot: m.entitlementSnapshot, SaaSCommand: m.saasCommand, SaaSStructureCommand: m.saasStructureCommand,
  ProviderEventStatus: z.strictObject({ event_id: id, status: z.enum(["APPLIED", "REJECTED"]), code: z.string().nullable(), subscription_id: id.nullable() }),
};
writeFileSync(new URL("../contracts/saas.schemas.json", import.meta.url), JSON.stringify(Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })])), null, 2) + "\n");
const organization_id = "f7000000-0000-4000-8000-000000000001", location_id = "f7000000-0000-4000-8000-000000000011";
const snapshot = {
  organization_id, location_id, version: 1, status: "ACTIVE", management_allowed: true,
  plan: { id: "f7000000-0000-4000-8000-000000000201", code: "PLAN_A", label: "PLAN_A", development_only: true, version_id: "f7000000-0000-4000-8000-000000000202", version: 1 },
  subscription: { status: "ACTIVE", version: 1, subscription_id: "f7000000-0000-4000-8000-000000000301", plan_version_id: "f7000000-0000-4000-8000-000000000202", creation_allowed: true, effective_from: "2026-10-01T00:00:00Z", effective_until: null, trial_end: null, grace_end: null },
  entitlements: m.capability.options.map(capability => ({ capability, configured: true, enabled: true, creation_allowed: true, reason: null })),
  period: { id: "f7000000-0000-4000-8000-000000000401", start: "2026-10-03T03:00:00Z", end: "2026-11-03T03:00:00Z" },
  quotas: [{ code: "ACTIVE_MEMBERS", configured: true, used: "4", limit: "5", status: "AVAILABLE" }, { code: "STORAGE_BYTES", configured: true, used: null, limit: null, status: "UNKNOWN" }],
  observed_at: "2026-10-14T12:00:00Z", diagnostics: { provider_rejected: 0, quota_rejections: 0, subscription_rejections: 0, usage_projection_mismatch: false },
};
m.entitlementSnapshot.parse(snapshot);
writeFileSync(new URL("../contracts/fixtures/saas-contract.json", import.meta.url), JSON.stringify({ snapshot, command: { type: "REQUEST_CHANGE", request_id: "f7000000-0000-4000-8000-000000000501", reason: "Review configured capability access" } }, null, 2) + "\n");
