'use strict';
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {createVendorDirectory}=require(path.join(root,'vendor-directory'));
async function checkVendorRegistration({createFixture,chromium,screenshotDirectory,entryAppSource}){
 const fixture=await createFixture({feedleImporter:{async metadata(){return {sourceId:'11111111-2222-4333-8444-555555555555',sourceUrl:'https://www.feedle.me/pet/11111111-2222-4333-8444-555555555555',species:'크레스티드 게코',morph:'화이트월',sex:'male',weight:'18',note:'피들 예시 설명',photoUrls:[]};}}});let browser;
 try{
  assert.equal(new URL(fixture.origin).hostname,'127.0.0.1','Only an isolated loopback fixture is permitted');
  const channel=fixture.channels[0].id,vendorId='registration-example';
  await fixture.repository.upsertRecord(channel,'vendor',{id:vendorId,name:'등록 안내 예시 업체'});
  const directory=createVendorDirectory(fixture.repository),profile=await directory.enroll(channel,vendorId);
  await directory.attach(profile.id,fixture.channels[1].id);
  for(const c of fixture.channels)await fixture.repository.upsertRecord(c.id,'setting',{id:'entry-policy',open:true,revision:3});
  const api=async(route,body)=>{const response=await fetch(fixture.origin+'/api/platform/'+route,{method:body?'POST':'GET',headers:{'X-Creo-Admin':fixture.secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert(response.ok,JSON.stringify(value));return value;};
  const link=await api('channels/'+channel+'/vendor-checkout-link',{vendorId});
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  await page.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort());
  if(entryAppSource)await page.route('**/vendor-entry-app.js*',route=>route.fulfill({contentType:'application/javascript',body:entryAppSource}));
  page.on('pageerror',error=>errors.push(error.message));
  const badge=section=>page.locator(`[data-vendor-section="${section}"].registration-required`);
  await page.goto(link.url);
  await page.locator('#profile-dialog[open]').waitFor();await page.locator('#profile-close').click();
  assert(await badge('entries').isVisible());assert(await badge('profile').isVisible());
  assert.equal(await page.locator('.vendor-bottom-nav').innerText(),'출품 개체\n낙찰·정산\n업체 정보');
  assert.match(await badge('profile').getAttribute('aria-label'),/등록 필요/);
  // A refresh must retain the known incomplete card while the next profile read waits.
  let releaseProfile,profileRequested;
  const profileGate=new Promise(r=>releaseProfile=r),profileStarted=new Promise(r=>profileRequested=r);
  await page.route('**/api/platform/vendor-checkout?*',async route=>{profileRequested();await profileGate;await route.continue();},{times:1});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await profileStarted;assert(await page.locator('#vendor-info-summary').isVisible(),'incomplete card must remain visible during refresh');
  const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/platform/vendor-checkout');releaseProfile();await refreshed;
  for(const width of [320,390,520]){
   await page.setViewportSize({width,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const sizes=await page.locator('.vendor-bottom-nav a').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,b:n.getBoundingClientRect().bottom})));
   assert(sizes.every(s=>s.w>=44&&s.h>=44&&s.b<=844));
   const tops=await page.locator('.vendor-bottom-nav svg').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
   assert(Math.max(...tops)-Math.min(...tops)<1,'navigation icons must align');
   const footer=await page.locator('.entry-footer').evaluate(n=>{const range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect(),box=n.getBoundingClientRect();return Math.abs((text.left+text.right)/2-(box.left+box.right)/2)});
   assert(footer<1,'copyright must be centered');
   const color=await badge('profile').evaluate(n=>getComputedStyle(n,'::after').backgroundColor);assert.equal(color,'rgb(207, 37, 37)');
   if(width===390)await page.screenshot({path:path.join(screenshotDirectory,'vendor-registration-empty.png')});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-vendor-section="profile"]').click();
  await page.locator('#profile-phone').fill('01000000009');
  await page.locator('#profile-bank').fill('예시은행');await page.locator('#profile-account').fill('000000000');await page.locator('#profile-holder').fill('예시 예금주');
  await page.locator('#profile-save').click();
  await page.waitForFunction(()=>!document.querySelector('[data-vendor-section="profile"]').classList.contains('registration-required'));
  assert(await badge('entries').isVisible());
  await page.locator('[data-vendor-section="entries"]').click();
  await page.waitForFunction(()=>document.querySelector('#vendor-info-summary')?.hidden&&document.querySelector('[data-vendor-section="profile"]')?.getAttribute('aria-label')===null);
  const failedRefresh=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/platform/vendor-checkout'&&r.status()===503);
  await page.route('**/api/platform/vendor-checkout?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'isolated read failure'})}),{times:1});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await failedRefresh;
  assert(!await page.locator('#vendor-info-summary').isVisible(),'failed refresh must preserve completed state');
  await page.locator('#add-entry').click();
  assert.equal(await page.locator('#entry-morph,[name="size"],#entry-form details').count(),0);
  assert(await page.locator('#entry-hatch').isVisible());assert(await page.locator('#entry-note').isVisible());
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.locator('#entry-note').fill('가상 릴리화이트');await page.locator('#entry-hatch').fill('2026-03-01');
  await page.screenshot({path:path.join(screenshotDirectory,'vendor-entry-simple.png'),fullPage:true});
  await page.locator('#submit-entry').click();
  await page.locator('#add-entry').waitFor();
  assert(!await badge('entries').isVisible());assert(!await badge('profile').isVisible());
  await page.screenshot({path:path.join(screenshotDirectory,'vendor-registration-complete.png')});
  await page.locator('#open-import').click();await page.locator('#feedle-url').fill('https://www.feedle.me/pet/11111111-2222-4333-8444-555555555555');await page.locator('#import-submit').click();
  await page.locator('#entry-note').waitFor();assert.equal(await page.locator('#entry-note').inputValue(),'모프: 화이트월\n피들 예시 설명');
  await page.locator('#entry-back').click();
  await page.locator('[data-vendor-section="settlement"]').click();await page.locator('#app:not([hidden])').waitFor();
  assert(!await badge('entries').isVisible());assert(!await badge('profile').isVisible());
  await page.locator('#vendor-event').selectOption(fixture.channels[1].id);
  await page.waitForFunction(()=>document.querySelector('[data-vendor-section="entries"]').classList.contains('registration-required'));
  assert(!await badge('profile').isVisible());
  await page.locator('[data-vendor-section="profile"]').click();await page.locator('#profile-form').waitFor();
  assert(await badge('entries').isVisible());assert(!await badge('profile').isVisible());
  await page.reload();await page.locator('#profile-form').waitFor();assert(await badge('entries').isVisible());
  const stored=await api('vendor-checkout?'+new URLSearchParams({code:link.code,event:channel}));
  assert.deepEqual(stored.entrySummary,{entriesOpen:true,entryCount:2});
  await fixture.repository.upsertRecord(fixture.channels[1].id,'setting',{id:'entry-policy',open:false,revision:4});
  await page.reload();await page.locator('#profile-form').waitFor();assert(!await badge('entries').isVisible());
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,widths:[320,390,520],flow:'empty → saved profile → saved entry → settlement → different auction → reload → intake closed',errors}));
 } finally {await browser?.close();await fixture.close();}
}
module.exports={checkVendorRegistration};
