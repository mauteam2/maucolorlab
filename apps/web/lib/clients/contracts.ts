import { z } from "zod";

export const clientStatus = z.enum(["ACTIVE", "ARCHIVED"]);
export const clientSummary = z.object({ id: z.uuid(), full_name: z.string(), phone_masked: z.string(), status: clientStatus, updated_at: z.string() });
export const clientDetail = z.object({ id: z.uuid(), organization_id: z.uuid(), full_name: z.string(), phone: z.string(), phone_normalized: z.string(), email: z.string().nullable(), birth_date: z.string().nullable(), status: clientStatus, version: z.number().int().positive(), created_at: z.string(), updated_at: z.string(), created_by: z.uuid(), updated_by: z.uuid(), creation_location_id: z.uuid() });
export const clientDirectory = z.object({ items: clientSummary.array(), has_more: z.boolean(), offset: z.number().int() });
export const duplicateCandidate = clientSummary.extend({ signals: z.enum(["PHONE", "NAME", "EMAIL", "BIRTH_DATE"]).array() });
const identity = { full_name: z.string().trim().min(2).max(160), phone: z.string().trim().min(8).max(40), phone_region: z.string().length(2).default("TR"), email: z.union([z.email().max(254), z.literal(""), z.null()]).optional(), birth_date: z.union([z.iso.date(), z.literal(""), z.null()]).optional() };
const mutation = { request_id: z.uuid(), confirmation_token: z.uuid().optional() };
const versioned = { client_id: z.uuid(), expected_version: z.number().int().positive(), request_id: z.uuid() };
export const clientCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list"), payload: z.object({ query: z.string().max(80).optional(), status: clientStatus.optional(), offset: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(50).optional() }).strict() }),
  z.object({ operation: z.literal("detail"), payload: z.object({ client_id: z.uuid() }).strict() }),
  z.object({ operation: z.literal("create"), payload: z.object({ ...identity, ...mutation }).strict() }),
  z.object({ operation: z.literal("update"), payload: z.object({ ...identity, ...mutation, ...versioned }).strict() }),
  z.object({ operation: z.literal("archive"), payload: z.object(versioned).strict() }),
  z.object({ operation: z.literal("restore"), payload: z.object(versioned).strict() }),
]);
export type Client = z.infer<typeof clientDetail>;
export type Directory = z.infer<typeof clientDirectory>;
export type Candidate = z.infer<typeof duplicateCandidate>;
export type Command = z.infer<typeof clientCommand>;
export const permissionFor = (operation: Command["operation"]) => `clients.${operation === "list" || operation === "detail" ? "read" : operation === "restore" ? "archive" : operation}`;
export const errorStatus = (code: string) => ({ UNAUTHENTICATED: 401, SESSION_EXPIRED: 401, FORBIDDEN: 403, NO_ACTIVE_MEMBERSHIP: 403, TENANT_CONTEXT_INVALID: 403, CLIENT_NOT_FOUND: 404, CLIENT_ARCHIVED: 409, CONFLICT: 409, DUPLICATE_CLIENT_CANDIDATES: 409, DUPLICATE_CONFIRMATION_INVALID: 409, VALIDATION_FAILED: 400 }[code] ?? 503);
export const clientErrorText: Record<string, string> = {
  VALIDATION_FAILED: "Ad soyad, telefon ve isteğe bağlı bilgileri kontrol edin.", CLIENT_NOT_FOUND: "Müşteri bulunamadı veya erişim izniniz yok.", CLIENT_ARCHIVED: "Düzenlemek için müşteriyi önce arşivden çıkarın.", CONFLICT: "Kayıt değişti. Güncel bilgileri açıp yeniden deneyin.", DUPLICATE_CONFIRMATION_INVALID: "Benzer kayıtlar değişti veya inceleme süresi doldu. Bilgileri yeniden kontrol edin.", FORBIDDEN: "Bu işlem için yetkiniz yok.", NETWORK_ERROR: "Bağlantı kurulamadı. Yeniden deneyin.",
};
