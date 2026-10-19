export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ELIFORA_DEPLOYMENT_ENV === "development") return;
  const { validateHostedConfig } = await import("./lib/pilot/config");
  if (validateHostedConfig(process.env).length) throw new Error("PILOT_CONFIGURATION_INVALID");
}
