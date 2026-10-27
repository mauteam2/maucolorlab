import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const { UI_ORIGIN: origin, UI_MODE: mode, UI_SHA: sha, UI_CI: ci, UI_BYPASS: bypass, UI_EMAIL: email, UI_PASSWORD: password } = process.env;
if (!origin || !['candidate','canonical'].includes(mode) || !sha || !ci || !bypass || !email?.endsWith('.invalid') || !password) throw Error('INVALID_OPERATOR_INPUT');
const host = new URL(origin).hostname;
if (!/^elifora-staging(?:-[a-z0-9]+-elifora)?\.vercel\.app$/.test(host)) throw Error('NOT_STAGING');
const output = 'apps/web/captures/reports', checks = [], captures = [];
const save = (name, data) => writeFile(`${output}/ui-ux-staging-${name}.json`, JSON.stringify(data,null,2));
const clean = value => [bypass,password,email].reduce((s,secret)=>s.replaceAll(secret,'[REDACTED]'),String(value));
await mkdir(output,{recursive:true});
let browser;
try {
 browser = await chromium.launch({headless:true});
 const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 // Restrict the deployment credential to this exact Vercel host, including redirects.
 await context.route('**/*', async route => {
  const request=route.request(), headers={...request.headers()};
  delete headers['x-vercel-protection-bypass'];
  if (new URL(request.url()).hostname===host) headers['x-vercel-protection-bypass']=bypass;
  await route.continue({headers});
 });
 const get = path => context.request.get(origin+path,{headers:{'x-vercel-protection-bypass':bypass},maxRedirects:0});
 const page=await context.newPage();page.setDefaultTimeout(45000);
 let response=await get('/api/color-registry');
 if (![401,403].includes(response.status())) throw Error('UNAUTHENTICATED_CATALOG_'+response.status());
 checks.push('unauthenticated catalog denied');
 await page.goto(origin+'/sign-in');
 await page.getByLabel('E-posta').fill(email);
 await page.getByLabel('Parola',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Oturum aç',exact:true}).click();
 await page.waitForURL(origin+'/workspace');
 checks.push('real hosted sign-in and workspace context');
 if(mode==='canonical') {
  const deadline=Date.now()+480000;let ready=false;
  while(Date.now()<deadline) {
   response=await get('/api/pilot/status');
   if(response.status()===200&&(await response.json()).data.release.gitSha===sha){ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!ready)throw Error('CANONICAL_PROMOTION_NOT_READY');
  await page.reload();
 }
 response=await get('/api/pilot/status');
 if(response.status()!==200)throw Error('RUNTIME_'+response.status());
 const runtime=(await response.json()).data;
 if(runtime.release.gitSha!==sha||runtime.release.ciRun!==ci||runtime.database.migrationHead!=='20261021144458'||!runtime.database.signingMatches||!runtime.database.privateStorage||runtime.database.catalogs.length||runtime.scope!=='CONFIGURATION_ONLY'||runtime.hostedEmailVerified||runtime.backupVerified)throw Error('RUNTIME_FINGERPRINT');
 await save('runtime-'+mode,runtime);
 checks.push('exact release, CI, migration, signing, private storage and open pilot gates');
 response=await get('/api/color-registry?limit=50');const registry=(await response.json()).data;
 if(response.status()!==200||registry.total!==30||registry.brands.length!==8||registry.items.length!==30||registry.items.some(x=>x.recipeSupport||x.catalogId!==null||x.ruleCount!==0||x.state!=='SOURCE_COLLECTED'))throw Error('CATALOG_AUTHORITY');
 checks.push('8 brands 30 regional records; no new executable chemistry');
 for (const path of ['/api/session','/api/stock','/api/finance','/api/reporting?kind=FINANCE&period=TODAY']) {
  response=await get(path);if(response.status()!==200)throw Error('READ_'+path+'_'+response.status());
 }
 checks.push('session stock finance reporting service boundaries');
 for (const [screen,path,ready] of [
  ['dashboard','/workspace','.today-heading'],
  ['clients','/workspace/clients','.crm-client-card'],
  ['profile','/workspace/clients/c7ba05c9-7eb0-43eb-8cac-25c56144e387','.salon-profile-banner'],
  ['catalog','/workspace/catalog','.registry-record'],
  ['appointments','/workspace/appointments','.salon-operations-columns'],
  ['stock','/workspace/stock','.stock-table'],
  ['finance','/workspace/finance','.salon-stats'],
  ['reports','/workspace/reports','.report-metrics'],
 ]) {
  await page.goto(origin+path);await expect(page.locator(ready).first()).toBeVisible();
  await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);
  for (const width of [1440,1280,1024,768,390,320]) {
   await page.setViewportSize({width,height:1000});
   await page.evaluate(async()=>{document.activeElement?.blur?.();window.scrollTo(0,0);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)))throw Error('OVERFLOW_'+screen+'_'+width);
   if([1440,320].includes(width)) {const file=`${output}/ui-ux-hosted-${mode}-${screen}-${width}.png`;await page.screenshot({path:file,fullPage:true});captures.push(file);}
  }
  checks.push(screen+' six widths');
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(origin+'/workspace/catalog');
 await page.getByLabel('Marka veya seri ara').fill('Color Touch');
 await page.getByLabel('Pazar',{exact:true}).selectOption('US');
 await page.getByRole('button',{name:'Filtrele',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('1 bölgesel kayıt');
 const unavailable='Bu seri ELIFORA kataloğunda yer alıyor ancak doğrulanmış teknik reçete desteği henüz yayınlanmadı.';
 await expect(page.getByText(unavailable,{exact:true})).toBeVisible();
 await page.locator('summary').filter({hasText:'1 resmî kaynak'}).click();
 await expect(page.getByText(/SHA-256:/)).toBeVisible();
 checks.push('catalog filter and official source fingerprint');
 await page.goto(origin+'/workspace/colorlab');
 await page.getByText('Listelenen serileri incele',{exact:true}).click();
 await page.getByLabel('Listelenen seri').selectOption({label:'Keune · Tinta Color · GB'});
 await expect(page.getByText(unavailable,{exact:true})).toBeVisible();
 checks.push('ColorLab discovery does not enable unverified recipe');
 await page.setViewportSize({width:320,height:1000});
 await page.getByRole('button',{name:'Menü',exact:true}).click();
 await expect(page.getByRole('link',{name:'Marka kütüphanesi bölümü'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Menü',exact:true})).toBeFocused();
 checks.push('mobile menu keyboard focus recovery');
 await save('hosted-'+mode,{status:'PASS',mode,origin,sourceHead:sha,ci,checks,captures,scope:'SYNTHETIC_HOSTED_UI_SMOKE',domainMutations:false,pilotGo:false});
 console.log(JSON.stringify({mode,status:'PASS',checks:checks.length,captures:captures.length}));
} catch(error) {
 await save('hosted-failure-'+mode,{status:'FAIL',mode,error:clean(error.message),checks});
 console.log(JSON.stringify({mode,status:'FAIL',error:clean(error.message)}));process.exitCode=1;
} finally {await browser?.close();}
