import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const {UI_ORIGIN:origin,UI_SHA:sha,UI_CI:ci,UI_BYPASS:bypass,UI_EMAIL:email,UI_PASSWORD:password,UI_OTHER_EMAIL:otherEmail,UI_OTHER_PASSWORD:otherPassword}=process.env;
if(origin!=='https://elifora-staging.vercel.app'||sha!=='ef36f937f13bc6a44c2a94ba237301e70ce78d8d'||ci!=='40873986501'||!bypass||!email?.endsWith('.invalid')||!otherEmail?.endsWith('.invalid')||!password||!otherPassword)throw Error('INVALID_SYNTHETIC_STAGING_INPUT');
const output='apps/web/captures/reports',prefix='SYNTHETIC QA ONLY',note='SYNTHETIC QA ONLY - artificial test input; not a real client, physical assessment, colorist review or processing approval.';
const ids=new Set(),checks=[],captures=[],blocked=[],manifest={application:sha,scope:'USER_AUTHORIZED_SYNTHETIC_STAGING_ONLY',clients:[],writes:[],targets:[],plans:[],clinicalApproval:false};
const save=(name,data)=>writeFile(`${output}/pass2-populated-${name}.json`,JSON.stringify(data,null,2));
const progress=()=>save('fixture-manifest',manifest);
const clean=v=>[bypass,password,email,otherPassword,otherEmail].reduce((s,x)=>s.replaceAll(x,'[REDACTED]'),String(v));
function allowed(path,body){
 if(path==='/api/clients')return ['list','detail'].includes(body?.operation)||(body?.operation==='create'&&body.payload?.full_name?.startsWith(prefix)&&['+12025550127','+12025550189'].includes(body.payload?.phone)&&body.payload?.phone_region==='US');
 if(path==='/api/crm/read')return body?.operation==='actions';
 const match=path.match(/^\/api\/clients\/([a-f0-9-]+)\/(hair-passport(?:\/(?:observations|tests))?|color-targets|color-plans)$/);
 return !!match&&ids.has(match[1]);
}
let browser;
await mkdir(output,{recursive:true});await progress();
try{
 browser=await chromium.launch({headless:true});
 async function session(){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url()),headers={...r.headers()};delete headers['x-vercel-protection-bypass'];
   if(u.origin===origin){headers['x-vercel-protection-bypass']=bypass;if(u.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())){let body;try{body=r.postDataJSON();}catch{}if(!allowed(u.pathname,body)){blocked.push({path:u.pathname,method:r.method()});return route.abort('blockedbyclient');}}}
   await route.continue({headers});
  });
  const page=await context.newPage();page.setDefaultTimeout(45000);
  const get=path=>context.request.get(origin+path,{headers:{'x-vercel-protection-bypass':bypass},maxRedirects:0});
  return {context,page,get};
 }
 async function login(s,e,p){await s.page.goto(origin+'/sign-in');await s.page.getByLabel('E-posta').fill(e);await s.page.getByLabel('Parola',{exact:true}).fill(p);await s.page.getByRole('button',{name:'Oturum aç',exact:true}).click();await s.page.waitForURL(origin+'/workspace');await expect(s.page.locator('.today-heading')).toBeVisible();}
 const publicContext=await browser.newContext();const challenge=await publicContext.request.get(origin+'/sign-in',{maxRedirects:0});
 if(![401,403].includes(challenge.status())&&!([301,302,303,307,308].includes(challenge.status())&&/vercel|sso|auth/i.test(challenge.headers().location??'')))throw Error('ALL_SSO_NOT_CHALLENGED');await publicContext.close();checks.push('ALL_SSO uncredentialed challenge');
 const s=await session(),{page,get}=s;
 for(const path of ['/api/session','/api/color-registry','/api/pilot/status']){const r=await get(path);if(![401,403].includes(r.status()))throw Error('UNAUTHENTICATED_READ_NOT_DENIED');}
 await login(s,email,password);const runtime=(await(await get('/api/pilot/status')).json()).data;
 if(runtime.release.gitSha!==sha||runtime.release.ciRun!==ci||runtime.database.migrationHead!=='20261021144458'||!runtime.database.signingMatches||!runtime.database.privateStorage||runtime.database.catalogs.length||runtime.scope!=='CONFIGURATION_ONLY'||runtime.hostedEmailVerified||runtime.backupVerified)throw Error('RUNTIME_OR_GATES_CHANGED');await save('runtime',runtime);
 const identity=(await(await get('/api/session')).json()).context;
 if(identity.role!=='owner'||identity.membership_status!=='active'||!identity.permissions.includes('color_plan.create'))throw Error('OWNER_AUTHORITY');
 checks.push('real owner authentication, exact application/CI and open Phase 10 gates');
 const headers={'x-vercel-protection-bypass':bypass,origin,'x-workspace-reference':`${identity.membership_id}:${identity.location_id}`};
 async function post(path,data){if(!allowed(path,data))throw Error('OUT_OF_FIXTURE_WRITE');const r=await s.context.request.post(origin+path,{headers,data,maxRedirects:0});const body=await r.json();if(!r.ok())throw Error(`FIXTURE_API_${r.status()}_${path}_${body.code??'UNKNOWN'}`);manifest.writes.push({path,requestId:data.request_id??data.payload?.request_id,correlationId:body.correlationId});await progress();return body.data;}
 async function snapshot(id){const r=await get(`/api/clients/${id}/hair-passport`);if(!r.ok())throw Error('SNAPSHOT_READ');return (await r.json()).data;}
 async function fixture(kind,full_name,phone){
  const c=await post('/api/clients',{operation:'create',payload:{full_name,phone,phone_region:'US',request_id:randomUUID()}});ids.add(c.id);manifest.clients.push({id:c.id,fullName:full_name,kind});await progress();await post(`/api/clients/${c.id}/hair-passport`,{request_id:randomUUID()});
  const base=await snapshot(c.id);manifest.clients.at(-1).passportId=base.passport.id;await progress();
  if(kind==='KNOWN')for(const region_id of [null,...base.regions.map(r=>r.id)]){
   const current=await snapshot(c.id),expected_version=region_id===null?current.passport.version:current.regions.find(r=>r.id===region_id).version;
   const technical={natural_level:{state:'KNOWN',value:7},perceived_level:{state:'KNOWN',value:7},grey_ratio:{state:'KNOWN',value:.9},porosity:{state:'KNOWN',value:'MEDIUM'},elasticity:{state:'KNOWN',value:'NORMAL'},thickness:{state:'KNOWN',value:'FINE'},density:{state:'KNOWN',value:'MEDIUM'},cosmetic_color_history:{state:'KNOWN',value:note},bleach_history:{state:'KNOWN',value:note},chemical_history:{state:'KNOWN',value:note}};
   await post(`/api/clients/${c.id}/hair-passport/observations`,{request_id:randomUUID(),expected_version,region_id,technical,evidence:{source:'PROFESSIONAL_VERIFIED',attestation:'PERSONALLY_ASSESSED',confidence:{state:'KNOWN',value:1},context:note}});
   for(const type of ['POROSITY','ELASTICITY','STRAND'])await post(`/api/clients/${c.id}/hair-passport/tests`,{request_id:randomUUID(),region_id,type,result:{state:'KNOWN',value:type==='POROSITY'?'MEDIUM':type==='ELASTICITY'?'NORMAL':'SYNTHETIC QA ONLY strand fixture'},notes:note});
  }
  return c.id;
 }
 const known=await fixture('KNOWN',prefix+' - Atlas Strand Workstation ef36f937','+12025550127');
 const step=name=>page.getByRole('navigation',{name:'ColorLab çalışma adımları'}).getByRole('button',{name,exact:true});
 async function capture(state,width){await page.setViewportSize({width,height:1000});await page.getByRole('heading',{name:'Renk çalışma alanı',exact:true}).click();await page.evaluate(async()=>{document.activeElement?.blur?.();window.scrollTo(0,0);await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error(`OVERFLOW_${state}_${width}`);
  await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);await expect(page.getByRole('link',{name:'ColorLab bölümü',exact:true,includeHidden:true})).toHaveAttribute('aria-current','page');await expect(page.locator('.cl-workflow button[aria-current="step"]')).toBeInViewport({ratio:1});
  const file=`${output}/pass2-populated-${state}-${width}.png`;await page.screenshot({path:file});await page.screenshot({path:file.replace('.png','-full.png'),fullPage:true});captures.push({state,width,path:file});await save('captures',captures);
 }
 async function generate(label){const target=page.waitForResponse(r=>r.url().endsWith('/color-targets')&&r.request().method()==='POST');const result=page.waitForResponse(r=>r.url().endsWith('/color-plans')&&r.request().method()==='POST');await page.getByRole('button',{name:'Renk planı oluştur',exact:true}).click();const t=await target;if(!t.ok())throw Error('UI_TARGET_NOT_SAVED');const targetData=(await t.json()).data;manifest.targets.push({label,id:targetData.id,clientId:label==='UNKNOWN'?unknown:known});await progress();const r=await result;if(!r.ok())throw Error('UI_PLAN_NOT_SAVED');const plan=(await r.json()).data;manifest.plans.push({label,id:plan.id,status:plan.result.status,clientId:label==='UNKNOWN'?unknown:known});await progress();await expect(page.getByRole('region',{name:'Teknik plan sonucu'})).toBeVisible();return plan;}
 await page.goto(origin+`/workspace/colorlab?client_id=${known}`);const picker=page.getByRole('region',{name:'Hızlı hedef oluşturucu'});await expect(picker).toBeVisible();await picker.getByRole('radio',{name:'7 · Orta sarı',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(picker.getByRole('radio',{name:'8 · Açık sarı',exact:true})).toBeChecked();await picker.getByRole('radio',{name:'Karamel',exact:true}).check();await picker.getByRole('button',{name:'Yapılandırılmış hedefi uygula',exact:true}).click();
 for(const width of [1440,390,320]){await step('Hedef').click();await capture('target',width);}
 const evaluated=await generate('KNOWN');expect(evaluated.result.targetInterpretation.regions.every(r=>r.level===8&&r.tones.join()==='COPPER,GOLD_WARM')).toBe(true);expect(evaluated.result.recipeDraft.executionStatus).toBe('REQUIRES_BRAND_ADAPTER');
 for(const width of [1440,390,320]){await step('Değerlendirme').click();await capture('evaluated',width);await expect(page.getByLabel('Risk değerlendirmesi')).toBeVisible();await expect(page.getByLabel('Kanıt güveni')).toBeVisible();await expect(page.getByLabel('Teknik uygulanabilirlik')).toBeVisible();}
 checks.push('target and real server-evaluated state: 1440/390/320; keyboard selection; no executable manufacturer recipe');
 await page.setViewportSize({width:1440,height:1000});await step('Hedef').click();await picker.getByRole('button',{name:'Bej sarı',exact:true}).click();await page.locator('.cl-expert>summary').click();const root=page.locator('.salon-region-editor').filter({has:page.locator('legend',{hasText:/^Dip/})});await root.getByLabel('Hedef seviye',{exact:true}).fill('7');await root.getByLabel('Ton ailesi',{exact:true}).selectOption('NEUTRAL');await expect(page.getByRole('region',{name:'Temsili hedef yönü'}).getByRole('heading',{name:'Bölgesel renk yönü'})).toBeVisible();await page.locator('.cl-expert>summary').click();
 for(const width of [1440,390,320]){await step('Hedef').click();await capture('regional',width);await expect(page.locator('.cl-region-direction')).toHaveCount(3);}
 const regional=await generate('REGIONAL');expect(new Set(regional.result.targetInterpretation.regions.map(r=>r.level))).toEqual(new Set([7,9]));checks.push('regional 7/9 target: 1440/390/320; real canonical interpretation');
 const unknown=await fixture('UNKNOWN',prefix+' - Zephyr Unassessed Evidence ef36f937','+12025550189');await page.goto(origin+`/workspace/colorlab?client_id=${unknown}`);await page.getByRole('region',{name:'Hızlı hedef oluşturucu'}).getByRole('button',{name:'Karamel',exact:true}).click();const pending=await generate('UNKNOWN');expect(pending.result.status).toBe('REQUIRES_ASSESSMENT');expect(pending.result.recipeDraft).toBeNull();expect(pending.result.safetyGate.canProgress).toBe(false);
 for(const width of [1440,390,320]){await step('Değerlendirme').click();await capture('unknown',width);await expect(page.locator('.cl-current-evidence')).toHaveText(['?','?','?']);await expect(page.locator('.cl-current-evidence .cl-hair-swatch')).toHaveCount(0);await expect(page.getByRole('link',{name:/Eksik kanıtı ve fiziksel testleri/})).toBeVisible();}
 checks.push('UNKNOWN remains unknown and server blocks normal recipe: 1440/390/320');
 const other=await session();await login(other,otherEmail,otherPassword);const foreign=(await(await other.get('/api/session')).json()).context;if(foreign.organization_id===identity.organization_id)throw Error('NOT_DISTINCT_TENANT');const denied=await other.context.request.post(origin+'/api/clients',{headers:{'x-vercel-protection-bypass':bypass,origin},data:{operation:'detail',payload:{client_id:known}}});expect(denied.status()).toBe(404);expect((await denied.json()).code).toBe('CLIENT_NOT_FOUND');await other.context.addCookies([{name:'elifora-workspace',value:identity.membership_id+':'+identity.location_id,url:origin,httpOnly:true,secure:true,sameSite:'Lax'}]);const forged=await other.get('/api/session');expect(forged.status()).toBe(403);expect((await forged.json()).code).toBe('TENANT_CONTEXT_INVALID');await other.context.close();checks.push('new synthetic fixture denied cross-tenant; forged workspace denied');
 const catalog=await get('/api/controlled-brand-recipes/catalogs');expect(catalog.status()).toBe(200);expect((await catalog.json()).data).toHaveLength(0);if(blocked.length)throw Error('OUT_OF_SCOPE_MUTATION_BLOCKED');await s.context.close();await progress();
 await save('acceptance',{status:'PASS',origin,application:sha,applicationCi:ci,checks,captures,fixtureIds:[...ids],blockedWrites:blocked,allResponsesReal:true,noMigrations:true,noCatalogPublication:true,phase10Gates:'OPEN',pilotGo:false});console.log(JSON.stringify({status:'PASS',captures:captures.length,checks:checks.length,syntheticClients:ids.size,application:sha}));
}catch(error){await progress();await save('failure',{status:'FAIL',error:clean(error.message),checks,blockedWrites:blocked,fixtureIds:[...ids]});console.log(JSON.stringify({status:'FAIL',error:clean(error.message)}));process.exitCode=1;}
finally{await browser?.close();}
