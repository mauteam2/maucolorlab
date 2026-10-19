// Pure validator shared by startup, CLI and tests. Never return configuration values.
export function validateHostedConfig(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  const require = (key: string, valid: boolean) => { if (!valid) errors.push(key); };
  const origin = (value: string | undefined) => {
    try { const u = new URL(value ?? ""); return u.protocol === "https:" && !u.username && !u.password && u.pathname === "/" && !u.search && !u.hash && !/^(localhost|127\.|\[|.*\.localhost$)/.test(u.hostname); } catch { return false; }
  };
  require("ELIFORA_DEPLOYMENT_ENV", ["staging", "pilot"].includes(env.ELIFORA_DEPLOYMENT_ENV ?? ""));
  require("ELIFORA_APP_ORIGIN", origin(env.ELIFORA_APP_ORIGIN));
  require("NEXT_PUBLIC_SUPABASE_URL", origin(env.NEXT_PUBLIC_SUPABASE_URL) && /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? ""));
  require("ELIFORA_SUPABASE_PROJECT_REF", /^[a-z0-9]{20}$/.test(env.ELIFORA_SUPABASE_PROJECT_REF ?? "") && env.NEXT_PUBLIC_SUPABASE_URL === `https://${env.ELIFORA_SUPABASE_PROJECT_REF}.supabase.co`);
  require("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""));
  require("ELIFORA_COLOR_PLAN_SIGNING_KEY", /^[a-f0-9]{64}$/.test(env.ELIFORA_COLOR_PLAN_SIGNING_KEY ?? "") && new Set(env.ELIFORA_COLOR_PLAN_SIGNING_KEY).size >= 12);
  require("ELIFORA_RELEASE_SHA", /^[a-f0-9]{40}$/.test(env.ELIFORA_RELEASE_SHA ?? ""));
  require("ELIFORA_RELEASE_VERSION", /^pilot\.\d+\.\d+\.\d+$/.test(env.ELIFORA_RELEASE_VERSION ?? ""));
  require("ELIFORA_RELEASE_CI_RUN", /^[1-9]\d+$/.test(env.ELIFORA_RELEASE_CI_RUN ?? ""));
  require("ELIFORA_ALLOWED_ORIGIN", env.ELIFORA_ALLOWED_ORIGIN === env.ELIFORA_APP_ORIGIN && origin(env.ELIFORA_ALLOWED_ORIGIN));
  require("ELIFORA_SAAS_POLICY", env.ELIFORA_SAAS_POLICY === "CONTROLLED_OPERATOR_ONLY");
  require("ELIFORA_AUTH_POLICY", env.ELIFORA_AUTH_POLICY === "INVITE_ONLY");
  require("ELIFORA_SUPPORT_REFERENCE", /^[A-Z0-9_-]{3,80}$/.test(env.ELIFORA_SUPPORT_REFERENCE ?? ""));
  // The application does not need a service-role client. Refuse accidental runtime privilege.
  require("SUPABASE_SECRET_KEY", !env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY);
  require("PUBLIC_SECRET_EXPOSURE", !Object.keys(env).some(key => key.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|SIGNING|PASSWORD|DATABASE/i.test(key)));
  require("ELIFORA_ENVIRONMENT_ISOLATION", env.ELIFORA_ENVIRONMENT_ISOLATION === "SEPARATE_PROJECT_AND_SECRETS");
  return errors;
}
