import { registryResponse } from "@/lib/brand/registry-http";
export async function GET(request: Request) { return registryResponse(request); }
