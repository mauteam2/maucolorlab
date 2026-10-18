import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./lib/security/headers";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers(){return [
    {source:"/:path*",headers:securityHeaders(process.env.ELIFORA_DEPLOYMENT_ENV,process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NODE_ENV==="development")},
    ...["/api/:path*","/workspace/:path*","/workspaces","/auth/:path*","/sign-in","/internal/:path*"].map(source=>({source,headers:[{key:"Cache-Control",value:"private, no-store"}]})),
  ];},
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
