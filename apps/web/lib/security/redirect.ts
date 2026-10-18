// Destinations are exact application paths; never forward a caller URL.
export function safeRecoveryDestination(value: string | null) {
 return value === "/auth/update-password" ? value : "/sign-in";
}
export function applicationOrigin(configured:string|undefined,deployment:string|undefined,host:string|null) {
 if(configured){const url=new URL(configured);if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new Error("Invalid application origin");return url.origin;}
 if(deployment!=="development"||!host||! /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))throw new Error("Application origin required");
 return new URL("http://"+host).origin;
}
