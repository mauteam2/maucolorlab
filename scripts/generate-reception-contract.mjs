import { writeFileSync } from "node:fs";
import { z } from "../apps/web/node_modules/zod/index.js";
import { appointmentReadiness } from "../apps/web/lib/salon/readiness.ts";
writeFileSync(new URL("../contracts/reception.schemas.json",import.meta.url),JSON.stringify({AppointmentReadiness:z.toJSONSchema(appointmentReadiness,{target:"draft-2020-12"})},null,2)+"\n");
