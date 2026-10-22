import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url)),{chromium,expect}=require('@playwright/test');
const origin=process.env.CATALOG_ORIGIN,mode=process.env.CATALOG_MODE,checks=[],captures=[];let browser;
const unavailable='Bu seri ELIFORA kataloğunda bulunuyor ancak doğrulanmış teknik reçete desteği henüz yayınlanmadı.';
const cleanError=value=>[process.env.CATALOG_BYPASS,process.env.CATALOG_PASSWORD].filter(Boolean).reduce((s,secret)=>s.replaceAll(secret,'[REDACTED]'),String(value));
await mkdir('apps/web/captures/reports',{recursive:true});
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',extraHTTPHeaders:{'x-vercel-protection-bypass':process.env.CATALOG_BYPASS}}),page=await context.newPage();page.setDefaultTimeout(60000);
 let reply;if(mode==='candidate'){reply=await context.request.get(origin+'/api/color-registry');if(![401,403].includes(reply.status()))throw Error('UNAUTHENTICATED_'+reply.status());checks.push('unauthenticated catalog denied');}
 await page.goto(origin+'/sign-in');await page.getByLabel('E-posta').fill(process.env.CATALOG_EMAIL);await page.getByLabel('Parola',{exact:true}).fill(process.env.CATALOG_PASSWORD);await page.getByRole('button',{name:'Oturum aç',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('sign-in'));
 if(mode==='previous'){
  reply=await context.request.get(origin+'/api/session');if(reply.status()!==503||(await reply.json()).code!=='RELEASE_NOT_READY')throw Error('OLD_RELEASE_NOT_CLOSED_'+reply.status());
  await writeFile('apps/web/captures/reports/catalog-staging-previous-release.json',JSON.stringify({status:'PASS',oldReleaseFailsClosed:true,httpStatus:503},null,2));console.log(JSON.stringify({mode,status:'PASS'}));
 }else{
 if(mode==='canonical'){
  const deadline=Date.now()+480000;let ready=false;
  while(Date.now()<deadline){const res=await context.request.get(origin+'/api/pilot/status');if(res.status()===200&&(await res.json()).data.release.gitSha===process.env.CATALOG_SHA){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,5000));}
  if(!ready)throw Error('CANONICAL_PROMOTION_NOT_READY');await page.goto(origin+'/workspace');
 }
 await page.waitForURL(origin+'/workspace');checks.push('real hosted sign-in and workspace context');
 reply=await context.request.get(origin+'/api/pilot/status');if(reply.status()!==200)throw Error('RELEASE_'+reply.status());const runtime=(await reply.json()).data;
 if(runtime.release.gitSha!==process.env.CATALOG_SHA||runtime.release.ciRun!=='39620297037'||runtime.database.migrationHead!=='20261021144458'||!runtime.database.signingMatches||!runtime.database.privateStorage||runtime.database.catalogs.length||runtime.scope!=='CONFIGURATION_ONLY'||runtime.hostedEmailVerified||runtime.backupVerified)throw Error('RUNTIME_FINGERPRINT');
 await writeFile(`apps/web/captures/reports/catalog-staging-runtime-${mode}.json`,JSON.stringify(runtime,null,2));checks.push('exact build migration signing private storage and gates');
 reply=await context.request.get(origin+'/api/color-registry?limit=50');const all=(await reply.json()).data;if(reply.status()!==200||all.total!==30||all.brands.length!==8||all.items.length!==30||all.items.some(x=>x.recipeSupport||x.catalogId!==null||x.ruleCount!==0||x.state!=='SOURCE_COLLECTED'))throw Error('CATALOG_COUNTS_OR_AUTHORITY');checks.push('30 regional records 8 brands no executable support');
 for(const [path,code] of [['?region=TR',200],['?limit=51',400],['?region=US&region=TR',400]]){reply=await context.request.get(origin+'/api/color-registry'+path);if(reply.status()!==code)throw Error('QUERY_'+path+'_'+reply.status());if(path==='?region=TR'&&(await reply.json()).data.items.length)throw Error('MARKET_FALLBACK');}checks.push('bounded validation and no TR fallback');
 await page.goto(origin+'/workspace/catalog');await expect(page.getByRole('heading',{name:'Marka kütüphanesi',exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('30 bölgesel kayıt');
 await page.getByLabel('Marka veya seri ara').fill('Color Touch');await page.getByLabel('Pazar',{exact:true}).selectOption('US');await page.getByRole('button',{name:'Filtrele',exact:true}).click();await expect(page.getByRole('status')).toContainText('1 bölgesel kayıt');await expect(page.getByText(unavailable,{exact:true})).toBeVisible();await page.getByText(/1 resmî kaynak/).click();await expect(page.getByText(/SHA-256:/)).toBeVisible();checks.push('US filter official receipt fingerprint visible');
 for(const width of [1440,320]){await page.setViewportSize({width,height:950});await page.evaluate(()=>window.scrollTo(0,0));await expect(page.getByRole('heading',{name:'Marka kütüphanesi',exact:true})).toBeVisible();const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollY}));if(dimensions.scrollWidth>width||dimensions.scrollY)throw Error('OVERFLOW_OR_SCROLL_'+width);const path=`apps/web/captures/reports/catalog-staging-${mode}-${width}.png`;await page.screenshot({path,fullPage:true});captures.push({path,...dimensions});}
 await page.goto(origin+'/workspace/colorlab');await page.getByText('Listelenen serileri incele',{exact:true}).click();await page.getByLabel('Listelenen seri').selectOption({label:'Keune · Tinta Color · GB'});await expect(page.getByText(unavailable,{exact:true})).toBeVisible();checks.push('ColorLab information-only selector and unsupported warning');
 for(const path of ['/api/session','/api/stock','/api/finance','/api/reporting?kind=FINANCE&period=TODAY']){reply=await context.request.get(origin+path);if(reply.status()!==200)throw Error('EXISTING_READ_'+path+'_'+reply.status());}checks.push('session stock finance reports read regression');
 const proof={status:'PASS',mode,origin,sourceHead:process.env.CATALOG_SHA,checks,captures,scope:'SYNTHETIC_HOSTED_CATALOG_SMOKE_NOT_REAL_SALON_ACCEPTANCE'};await writeFile(`apps/web/captures/reports/catalog-staging-browser${mode==='canonical'?'-canonical':''}.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify({mode,status:'PASS',checks:checks.length,captures:captures.length}));
 }
}catch(e){const error=cleanError(e.message);await writeFile(`apps/web/captures/reports/catalog-staging-browser-failure-${mode}.json`,JSON.stringify({mode,error,checks},null,2));console.log(JSON.stringify({mode,status:'FAIL',error,checks}));process.exitCode=1;}finally{if(browser)await browser.close();}
