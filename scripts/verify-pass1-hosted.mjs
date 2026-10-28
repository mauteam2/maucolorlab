import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const { UI_ORIGIN: origin, UI_MODE: mode, UI_SHA: sha, UI_CI: ci, UI_BYPASS: bypass, UI_EMAIL: email, UI_PASSWORD: password, UI_OTHER_EMAIL: otherEmail, UI_OTHER_PASSWORD: otherPassword } = process.env;
if (!origin || !['candidate','canonical'].includes(mode) || !sha || !ci || !bypass || !email?.endsWith('.invalid') || !otherEmail?.endsWith('.invalid') || !password || !otherPassword) throw Error('INVALID_OPERATOR_INPUT');
const host=new URL(origin).hostname;
if (!/^elifora-staging(?:-[a-z0-9]+-elifora)?\.vercel\.app$/.test(host)) throw Error('NOT_STAGING');
const output='apps/web/captures/reports', checks=[], captures=[];
const save=(name,data)=>writeFile(`${output}/pass1-staging-${name}.json`,JSON.stringify(data,null,2));
const clean=value=>[bypass,password,email,otherPassword,otherEmail].reduce((s,v)=>s.replaceAll(v,'[REDACTED]'),String(value));
await mkdir(output,{recursive:true});
let browser;
try {
 browser=await chromium.launch({headless:true});
 async function session() {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{
   const request=route.request(),headers={...request.headers()};delete headers['x-vercel-protection-bypass'];
   if(new URL(request.url()).hostname===host)headers['x-vercel-protection-bypass']=bypass;
   await route.continue({headers});
  });
  const get=path=>context.request.get(origin+path,{headers:{'x-vercel-protection-bypass':bypass},maxRedirects:0});
  const readClient=(operation,payload)=>context.request.post(origin+'/api/clients',{headers:{'x-vercel-protection-bypass':bypass,origin},data:{operation,payload},maxRedirects:0});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  return {context,page,get,readClient};
 }
 async function login(s,e,p) {
  await s.page.goto(origin+'/sign-in');await s.page.getByLabel('E-posta').fill(e);
  await s.page.getByLabel('Parola',{exact:true}).fill(p);
  await s.page.getByRole('button',{name:'Oturum aç',exact:true}).click();
  await s.page.waitForURL(origin+'/workspace');await expect(s.page.locator('.today-heading')).toBeVisible();
 }
 const s=await session(),{page,get}=s;
 for(const path of ['/api/session','/api/color-registry','/api/pilot/status','/api/stock','/api/finance']) {
  const r=await get(path);if(![401,403].includes(r.status()))throw Error('UNAUTHENTICATED_'+path+'_'+r.status());
 }
 checks.push('unauthenticated session/catalog/pilot/stock/finance denied');
 await login(s,email,password);checks.push('real hosted owner sign-in');
 if(mode==='canonical') {
  const deadline=Date.now()+480000;let ready=false;
  while(Date.now()<deadline) {
   const r=await get('/api/pilot/status');if(r.status()===200&&(await r.json()).data.release.gitSha===sha){ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!ready)throw Error('CANONICAL_PROMOTION_NOT_READY');await page.reload();
 }
 let response=await get('/api/pilot/status');if(response.status()!==200)throw Error('RUNTIME_'+response.status());
 const runtime=(await response.json()).data;
 if(runtime.release.gitSha!==sha||runtime.release.ciRun!==ci||runtime.database.migrationHead!=='20261021144458'||!runtime.database.signingMatches||!runtime.database.privateStorage||runtime.database.catalogs.length||runtime.scope!=='CONFIGURATION_ONLY'||runtime.hostedEmailVerified||runtime.backupVerified)throw Error('RUNTIME_FINGERPRINT');
 await save('runtime-'+mode,runtime);checks.push('exact SHA/accepted CI/migration/signing/private storage; Phase 10 gates open');
 response=await get('/api/session');const identity=(await response.json()).context;
 if(response.status()!==200||identity.role!=='owner'||identity.membership_status!=='active')throw Error('OWNER_CONTEXT');
 response=await get('/api/color-registry?limit=50');const registry=(await response.json()).data;
 if(response.status()!==200||registry.total!==30||registry.brands.length!==8||registry.items.some(x=>x.recipeSupport||x.catalogId!==null||x.ruleCount!==0||x.state!=='SOURCE_COLLECTED'))throw Error('CATALOG_AUTHORITY');
 checks.push('discovery-only catalog unchanged; no executable publication');
 for(const path of ['/api/stock','/api/finance','/api/reporting?kind=FINANCE&period=TODAY']) {
  response=await get(path);if(response.status()!==200)throw Error('OWNER_READ_'+path+'_'+response.status());
 }
 await page.goto(origin+'/workspace');await expect(page.getByRole('region',{name:'Şimdi ve sırada'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Bugünün ajandası'})).toBeVisible();
 await expect(page.getByText(/yükleniyor|doğrulanıyor/iu)).toHaveCount(0);
 const shellPermissions=[['Müşteriler','clients.read'],['Randevular','salon.read'],['ColorLab','color_plan.read'],['Canlı uygulama','live_session.view'],['Marka kütüphanesi','color_plan.read'],['Stok','stock.view'],['Finans','finance.view'],['Raporlar','reports.read'],['Ekip','salon.read'],['Ayarlar','salon.read']];
 for(const [label,permission]of shellPermissions)await expect(page.getByRole('link',{name:label+' bölümü',exact:true})).toHaveCount(identity.permissions.includes(permission)?1:0);
 await expect(page.locator('.today-context .salon-organization-name')).toHaveText(identity.organization_name);
 await expect(page.locator('.today-context small')).toContainText(identity.location_name);
 await expect(page.locator('.today-context small')).toContainText('Salon Sahibi');
 await expect(page.locator('.salon-nav-group')).toHaveText(['Salon','Renk zekâsı','İşletme']);
 await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);
 await expect(page.getByRole('link',{name:'Bugün bölümü',exact:true})).toHaveAttribute('aria-current','page');
 checks.push('shell links match authoritative permissions; single active item; distinct organization/location/role');
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:1000});
  await expect(page.getByRole('region',{name:'Şimdi ve sırada'})).toBeVisible();
  await expect(page.getByText(/yükleniyor|doğrulanıyor/iu)).toHaveCount(0);
  await page.evaluate(async()=>{document.activeElement?.blur?.();window.scrollTo(0,0);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('OVERFLOW_'+width);
  for(const selector of ['.today-technical','.today-action-center']) {
   const disclosure=page.locator(selector);if(await disclosure.count())await expect.poll(()=>disclosure.evaluate(el=>el.open)).toBe(width===1440);
  }
  await expect(page.locator('.today-business')).not.toHaveAttribute('open','');
  const file=`${output}/pass1-hosted-${mode}-dashboard-${width}.png`;await page.screenshot({path:file,fullPage:true});captures.push(file);
  if(width<600) {
   const menu=page.getByRole('button',{name:'Menü',exact:true});await menu.click();
   await expect(menu).toHaveAttribute('aria-expanded','true');
   await expect(page.getByRole('link',{name:'Bugün bölümü',exact:true})).toBeFocused();
   await expect(page.getByRole('link',{name:'Marka kütüphanesi bölümü'})).toBeVisible();
   const file=`${output}/pass1-hosted-${mode}-shell-menu-${width}.png`;await page.screenshot({path:file,fullPage:true});captures.push(file);
   await page.keyboard.press('Escape');await expect(menu).toBeFocused();await expect(menu).toHaveAttribute('aria-expanded','false');
  }
  checks.push(`Dashboard and shell ${width}px; overflow/compact disclosures/menu focus`);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('.today-business summary').click();await expect(page.locator('.today-revenue')).toBeVisible();
 await expect(page.getByText(/yükleniyor|doğrulanıyor/iu)).toHaveCount(0);
 checks.push('owner business disclosure uses loaded read-only report');
 const listed=await s.readClient('list',{limit:50});if(listed.status()!==200)throw Error('CLIENT_LIST');
 const clientList=await listed.json();const clientId=clientList.data?.items?.[0]?.id;
 if(!clientId)throw Error('EXISTING_SYNTHETIC_CLIENT_REQUIRED');
 const other=await session();await login(other,otherEmail,otherPassword);
 response=await other.get('/api/session');const foreign=(await response.json()).context;
 if(response.status()!==200||foreign.organization_id===identity.organization_id)throw Error('SEPARATE_TENANT_REQUIRED');
 response=await other.readClient('detail',{client_id:clientId});const denied=await response.json();
 if(response.status()!==404||denied.code!=='CLIENT_NOT_FOUND')throw Error('CROSS_TENANT_CLIENT_NOT_DENIED');
 const before=await other.context.cookies(origin);
 await other.context.addCookies([{name:'elifora-workspace',value:identity.membership_id+':'+identity.location_id,url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);
 response=await other.get('/api/session');if(response.status()!==403||(await response.json()).code!=='TENANT_CONTEXT_INVALID')throw Error('FORGED_WORKSPACE_NOT_DENIED');
 await other.context.clearCookies();await other.context.addCookies(before);
 await other.context.close();checks.push('second real tenant login; foreign client 404; forged owner workspace 403');
 await s.context.close();
 await save('hosted-'+mode,{status:'PASS',mode,origin,sourceHead:sha,ci,checks,captures,scope:'SYNTHETIC_HOSTED_UI_SMOKE',domainMutations:false,pilotGo:false,permissionCoverage:'hosted owner allow + unauth deny + cross-tenant deny + forged workspace deny; restricted-role matrix in accepted exact-SHA CI',hostedState:'existing synthetic tenant; no appointments seeded'});
 console.log(JSON.stringify({mode,status:'PASS',checks:checks.length,captures:captures.length}));
}catch(error){await save('hosted-failure-'+mode,{status:'FAIL',mode,error:clean(error.message),checks});console.log(JSON.stringify({mode,status:'FAIL',error:clean(error.message)}));process.exitCode=1;}
finally{await browser?.close();}
