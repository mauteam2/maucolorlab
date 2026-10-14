import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

// Adapter verification receives original bytes. No parsed/re-serialized body
// can replace the signature input, and no provider is configured by default.
export const providerCommand = z.strictObject({ type: z.literal("SUBSCRIPTION"), expected_version: z.int().nonnegative(), plan_version_id: z.uuid(), status: z.enum(["ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED", "CANCELLED"]), effective_until: z.iso.datetime({ offset: true }).nullable().optional(), trial_end: z.iso.datetime({ offset: true }).nullable().optional(), grace_end: z.iso.datetime({ offset: true }).nullable().optional(), provider_subscription_ref: z.string().min(1).max(200).optional() });
const normalizedEvent = z.strictObject({ event_id: z.string().min(1).max(200), customer_ref: z.string().min(1).max(200), command: providerCommand });
const verified = Symbol("raw-provider-event-verified");
export type VerifiedProviderEvent = z.infer<typeof normalizedEvent> & { provider: string; payload_hash: string; [verified]: true };
export interface BillingProviderAdapter { readonly provider: string; verify(raw: Uint8Array, headers: Headers): Promise<unknown | null> }
export interface ProviderEventStore { apply(event: VerifiedProviderEvent, correlationId: string): Promise<unknown> }
export async function receiveProviderEvent(raw: Uint8Array, headers: Headers, adapter: BillingProviderAdapter | null, store: ProviderEventStore, correlationId: string) {
  if (!adapter) throw new Error("PROVIDER_NOT_CONFIGURED");
  if (raw.byteLength === 0 || raw.byteLength > 32768 || !/^[A-Z0-9_-]{1,80}$/.test(adapter.provider) || !z.uuid().safeParse(correlationId).success) throw new Error("PROVIDER_INPUT_INVALID");
  const bytes = new Uint8Array(raw), hash = createHash("sha256").update(bytes).digest("hex");
  const result = await adapter.verify(bytes, new Headers(headers));
  const parsed = normalizedEvent.safeParse(result);
  if (!parsed.success || createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("PROVIDER_SIGNATURE_INVALID");
  return store.apply({ ...parsed.data, provider: adapter.provider, payload_hash: hash, [verified]: true }, correlationId);
}
export function assertVerifiedProviderEvent(event: VerifiedProviderEvent) { if (event[verified] !== true) throw new Error("PROVIDER_SIGNATURE_INVALID"); }
