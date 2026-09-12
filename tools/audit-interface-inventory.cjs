// Read-only source inventory. Optional production probes request static HTML only.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const output = path.resolve(__dirname, '../docs/ui-audit');
let previous={pages:[]};
try{previous=JSON.parse(fs.readFileSync(path.join(output,'page-inventory.json'),'utf8'));}catch{}
const previousPages=new Map(previous.pages.map(page=>[page.route,page]));
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : e.name.endsWith('.html') ? [path.join(dir,e.name)] : []); }
const byRole = {
  public: ['welcome.html'],
  buyer: ['buyer-shipping.html','buyer-delivery.html','shipping-status.html','buyer-library.html'],
  vendor: ['vendor-checkout.html','vendor-status.html','vendor-entries.html'],
  organizer: ['organizer-shipping.html'],
  broadcast: ['auction-live.html','broadcast.html','broadcast-studio.html','broadcast-router.html','crewart-broadcast.html','crewart-preview.html','preview.html','tournament-bracket.html','ranking.html','crewart-ranking.html','roulette/index.html','cam.html','cam/index.html'],
  tool: ['banner_maker.html','banner-library.html','capture-setup.html','capture-gallery.html','print.html'],
  survey: ['crewart-survey.html'],
  operator: ['index.html','operator-login.html','auction-control.html','band-monitor.html','cdcup-index.html','cdcup/index.html','channel-archives.html','channel-manager.html','channel-rankings.html','channel-shipping.html','channel-workspace.html','checkout-changes.html','checkout-practice.html','crewart-control.html','crewart-settings.html','crewarts/index.html','platform-layout-editor.html','settings.html','shipping.html','shipping-companies.html','shipping-rates.html','summary.html','vendor-entry-review.html']
};
const strip = value => value.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
const rows = files(root).sort().map(file => {
  const route = path.relative(root,file).replaceAll('\\','/'), html = fs.readFileSync(file,'utf8');
  const role = route.startsWith('_local') ? 'local-only' : Object.keys(byRole).find(k => byRole[k].includes(route)) || 'unclassified';
  const values = pattern => [...html.matchAll(pattern)].map(m => m[1]);
  const prior=previousPages.get(route)?.production;
  return { route, role, title:strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''), headings:values(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi).map(strip), styles:values(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi).filter(s=>s.includes('.css')), scripts:values(/<script\b[^>]*src=["']([^"']+)["']/gi), navigation:values(/<a\b[^>]*href=["']([^"']+)["']/gi).filter(s=>!s.startsWith('#')), visualReview:'pending', production:prior?{...prior,observedAt:prior.observedAt||previous.generatedAt}:null };
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  if(process.argv.includes('--production')) {
    const queue=rows.filter(r=>r.role!=='local-only');
    async function worker(){while(queue.length){const row=queue.shift();try{const response=await fetch('https://creok.onrender.com/'+row.route,{redirect:'manual',signal:AbortSignal.timeout(15000)});const html=await response.text();row.production={status:response.status,contentType:response.headers.get('content-type'),title:strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||''),bytes:Buffer.byteLength(html),redirect:response.headers.get('location')};}catch(e){row.production={error:e.message};}}}
    await Promise.all([worker(),worker()]);
    for(const row of rows)if(row.production&&row.role!=='local-only')row.production.observedAt=new Date().toISOString();
  }
  const result={generatedAt:new Date().toISOString(),scope:'Static HTML inventory only; no API/customer records fetched. Production observations retain their original dates and do not prove current local code is deployed. Visual and permission evidence is recorded separately.',pages:rows};
  fs.writeFileSync(path.join(output,'page-inventory.json'),JSON.stringify(result,null,2)+'\n');
  const md=['# 전체 페이지 목록','',result.scope,'','| 경로 | 역할 | 제목 | 운영 HTTP · 확인일 | 실화면 검토 |','| --- | --- | --- | --- | --- |',...rows.map(r=>`| ${r.route} | ${r.role} | ${r.title.replaceAll('|','/')} | ${r.production?.status||r.production?.error||'미확인'}${r.production?.observedAt?' · '+r.production.observedAt.slice(0,10):''} | 별도 기록 |`),'','이 목록은 동작/디자인 통과 판정이 아니다. 각 페이지의 데이터·권한·반응형 상태를 실제로 확인해야 한다.',''];
  fs.writeFileSync(path.join(output,'PAGE_INVENTORY.md'),md.join('\n'));
  console.log(JSON.stringify({pages:rows.length,roles:Object.fromEntries([...new Set(rows.map(r=>r.role))].map(role=>[role,rows.filter(r=>r.role===role).length])),production:process.argv.includes('--production')?rows.filter(r=>r.production).length:0,output}));
})().catch(e=>{console.error(e);process.exit(1)});
