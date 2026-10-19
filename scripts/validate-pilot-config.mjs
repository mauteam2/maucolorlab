import { validateHostedConfig } from '../apps/web/lib/pilot/config.ts';
const failures = validateHostedConfig(process.env);
// Names only. Do not stringify env, error objects or supplied values.
console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', invalidFields: failures }));
process.exitCode = failures.length ? 1 : 0;
