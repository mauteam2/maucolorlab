import "server-only";
import { z } from "zod";

const serverEnvironmentSchema = z.object({
  ELIFORA_DEPLOYMENT_ENV: z.enum(["development", "staging", "pilot", "production"]),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    ELIFORA_DEPLOYMENT_ENV: process.env.ELIFORA_DEPLOYMENT_ENV,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

