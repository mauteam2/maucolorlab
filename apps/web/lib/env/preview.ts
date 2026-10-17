import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
// Build optimization mode is independent from the deployment environment.
// Synthetic previews remain restricted to an explicit local development server.
export async function requireDevelopmentPreview() {
 if (process.env.ELIFORA_DEPLOYMENT_ENV !== "development") notFound();
 const host = (await headers()).get("host") ?? "";
 let hostname = "";
 try { hostname = new URL(`http://${host}`).hostname; } catch { notFound(); }
 if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) || /[\s/@?#]/.test(host)) notFound();
}
