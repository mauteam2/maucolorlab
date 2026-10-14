import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
// Disposable test runner only; never imported by application modules.
export function sql(text: string) {
  const status = JSON.parse(readFileSync(process.env.ELIFORA_TEST_STATUS_FILE!, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw new Error("Disposable local database required");
  return execFileSync("docker", ["exec", "-i", "supabase_db_elifora", "psql", "-XAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8" }).trim();
}
export function configure(org: string, state = "ACTIVE", stock = true, locations: number | null = null) {
  if (!/^[a-f0-9-]{36}$/.test(org) || !["ACTIVE", "SUSPENDED"].includes(state)) throw new Error("Invalid synthetic control input");
  const q = JSON.stringify({ type: "PLAN_VERSION", code: "PLAN_B", label: "PLAN_B", development_only: true, entitlements: Object.fromEntries(["COLOR_ENGINE", "BRAND_ADAPTER", "LIVE_SESSION", "CRM", "STOCK", "FINANCE", "COSTING", "COMMISSION", "REPORTING", "AI_GATEWAY"].map(c => [c, c !== "STOCK" || stock])), quotas: { LOCATIONS: locations, ACTIVE_MEMBERS: null, ENGINE_EXECUTIONS: null, STORAGE_BYTES: null } });
  sql(`begin;select pg_advisory_xact_lock_shared(hashtextextended('${org}',0));select pg_advisory_xact_lock(hashtextextended('${org}:saas',71));select pg_advisory_xact_lock(hashtextextended('saas-plan:PLAN_B',72));
  do $$declare p uuid;begin
  p:=(app_private.saas_control('${org}','${q}'::jsonb||jsonb_build_object('expected_version',(select coalesce(max(v.version),0) from app_private.saas_plan_versions v join app_private.saas_plans p on p.id=v.plan_id where p.code='PLAN_B')),'E2E_OPERATOR','Disposable entitlement transition',gen_random_uuid())#>>'{data,id}')::uuid;
  perform app_private.saas_control('${org}',jsonb_build_object('type','SUBSCRIPTION','expected_version',(select version from app_private.saas_accounts where organization_id='${org}'),'plan_version_id',p,'status','${state}'),'E2E_OPERATOR','Disposable subscription transition',gen_random_uuid());end$$;commit;`);
}
