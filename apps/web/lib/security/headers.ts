export function securityHeaders(deployment:string|undefined,supabaseUrl:string|undefined,developmentBuild:boolean){
 const connect=["'self'"];
 if(supabaseUrl){const url=new URL(supabaseUrl);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error("Invalid Supabase origin");connect.push(url.origin,url.origin.replace(/^http/,"ws"));}
 const csp=["default-src 'self'",`script-src 'self' 'unsafe-inline'${developmentBuild?" 'unsafe-eval'":""}`,"style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self'","object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'",`connect-src ${connect.join(" ")}`].join("; ");
 const headers=[{key:"Content-Security-Policy",value:csp},{key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},{key:"Referrer-Policy",value:"no-referrer"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"}];
 if(deployment&&deployment!=="development")headers.push({key:"Strict-Transport-Security",value:"max-age=31536000"});
 return headers;
}
