'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/auction-live.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../public/broadcast-national.css'),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('national presenter captions use Korean defaults and retain explicitly configured names and roles',()=>{
 const ctx={esc,banner:()=>'',showBanner:()=>false,pageTicker:()=>'',c:{broadcastTheme:'national-stage'},s:{hostName1:'옹동2',hostName2:'함께하는 업체',hostName3:'초대 손님'}};
 vm.createContext(ctx);vm.runInContext(html.match(/^function pageOne\([^\n]+/m)[0],ctx);
 const render=()=>vm.runInContext('pageOne(c,s,[])',ctx);
 assert.match(render(),/>진행<.*>함께<.*>초대</);ctx.s.hostRole1='특별 진행';assert.match(render(),/>특별 진행</);
 ctx.s.hostName1='<img onerror="bad">';assert.doesNotMatch(render(),/<img/);assert.match(render(),/&lt;img/);
 ctx.s.page1HostsOn=false;assert.doesNotMatch(render(),/host-card/);ctx.s.page1HostsOn=true;ctx.c.broadcastTheme='base';ctx.s.hostRole1='';assert.match(render(),/MAIN HOST/);
});
test('national captions remain theme-scoped, transparent outside their slots, and load after shared overrides',()=>{
 for(const match of css.matchAll(/([^{}]+)\{/g)){const selector=match[1].replace(/\/\*[\s\S]*?\*\//g,'').replace(/:is\([^)]*\)/g,':is(*)').trim();for(const part of selector.split(','))assert.ok(part.trim().startsWith('body[data-broadcast-theme="national-stage"]'),part);}
 assert.doesNotMatch(css,/url\(|animation:|transition:/);assert.match(css,/\.host-name\{[^}]*font-size:[^;]+!important/);
 assert.match(css,/\.simple-ranking\{[^}]*background:transparent!important/);
 assert.ok(html.indexOf('broadcast-national.css')>html.indexOf('broadcast-bidders.css'));
 const bodyRule=css.match(/body\[data-broadcast-theme="national-stage"\]\{([^}]+)\}/)[1];assert.doesNotMatch(bodyRule,/(?:^|;)\s*(?:background|border|padding|margin):/);
});
test('national caption and board color pairs meet text contrast requirements',()=>{
 const rgb=hex=>hex.match(/\w\w/g).map(n=>parseInt(n,16));
 const luminance=rgb=>{const c=rgb.map(n=>n/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 const token=name=>css.match(new RegExp('--national-'+name+':#([0-9a-f]{6})'))[1];
 const pairs=[[rgb(token('ink')),rgb(token('paper'))],[rgb('ffffff'),rgb(token('number'))]];
 const ribbon=css.match(/--national-ribbon:([^;]+)/)[1],colors=[...ribbon.matchAll(/#([0-9a-f]{6})(?![0-9a-f])/g)].map(m=>rgb(m[1]));
 const gloss=parseInt(ribbon.match(/#ffffff([0-9a-f]{2})/)[1],16)/255;
 for(const color of colors)pairs.push([rgb('ffffff'),color.map(v=>v*(1-gloss)+255*gloss)]);
 for(const [fg,bg] of pairs){const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,JSON.stringify({fg,bg,ratio}));}
});
function renderer(names,extras={}){
 const ctx=vm.createContext({esc,money:n=>Number(n).toLocaleString('ko-KR'),CreoAuctionContract:require('../public/auction-contract'),CreoBroadcastItemNotes:require('../public/broadcast-item-notes'),...extras});
 for(const name of names){const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);assert.ok(start>=0);vm.runInContext(html.slice(start,end).split('\nwindow.addEventListener')[0],ctx);}return ctx;
}
test('national item ribbon preserves escaped identity, traits and notes and keeps the base layout intact',()=>{
 const ctx=renderer(['pageTwoInfoTraits','pageTwoInlineInfo']);
 const item={name:'A01 <개체>',attributes:{checklist:'gender:F|weight:28|birth:2026-04-09'},note:'부모 & 비고'};
 const national=ctx.pageTwoInlineInfo(item,'<span class="vendor-tag">업체</span>',true,true);
 assert.match(national,/national-item-detail/);for(const text of ['A01 &lt;개체&gt;','암컷','28g','2026-04-09','부모 &amp; 비고'])assert.ok(national.includes(text),text);
 assert.equal((national.match(/class="vendor-tag"/g)||[]).length,1);
 assert.doesNotMatch(ctx.pageTwoInlineInfo(item,'',false,true),/broadcast-item-note|부모/);
 const base=ctx.pageTwoInlineInfo(item,'업체');assert.doesNotMatch(base,/national-item-detail/);assert.match(base,/item-inline-sep/);
 assert.doesNotMatch(ctx.pageTwoInlineInfo({name:'B01'},'',true,true),/A01|암컷|28g|부모/);
});
test('national ranking captions preserve the page offset, full names, money and empty state',()=>{
 let scene={kind:'vendor',offset:5,page:2,pages:2,rows:[{name:'아주 긴 가상 업체 <이름>',total:10000000}]};
 const ctx=renderer(['renderScoreboardPageThree'],{summaryScene:()=>scene});
 const national=ctx.renderScoreboardPageThree({broadcastTheme:'national-stage'},{},[]);
 assert.match(national,/summary-identity/);assert.match(national,/data-rank="6"/);assert.match(national,/아주 긴 가상 업체 &lt;이름&gt;/);assert.match(national,/10,000,000/);assert.match(national,/2 \/ 2/);
 const base=ctx.renderScoreboardPageThree({broadcastTheme:'base'},{},[]);assert.doesNotMatch(base,/summary-identity/);assert.ok(base.indexOf('summary-rank')<base.indexOf('summary-name'));
 scene={...scene,rows:[],offset:0,page:1,pages:1};assert.match(ctx.renderScoreboardPageThree({broadcastTheme:'national-stage'},{},[]),/낙찰 내역 대기 중/);
 scene=null;assert.equal(ctx.renderScoreboardPageThree({broadcastTheme:'national-stage'},{},[]),'');
});
test('unplaced national hosts retain definite height and long bidder names get a length-based fit without losing data',()=>{
 assert.match(css,/\.host-card\{[^}]*height:9%/);
 for(const index of [2,3])assert.ok(css.includes('.host-card[data-host-index="'+index+'"]:not([data-layout-custom="1"])'));
 assert.match(css,/\.price-card:not\(\[data-layout-custom="1"\]\)\{[^}]*left:35%/);
 const ctx=renderer(['bidSortValue','pageTwoBidRows','bidAmountLabel','pageTwoBidders']),name='가상 크레스티드게코 연구소';
 const output=ctx.pageTwoBidders({bidLog:[{name,amount:30}]},{});
 assert.ok(output.includes(name));assert.ok(output.includes('--bid-name-units:'+Array.from(name).length));assert.match(output,/30만/);
 assert.match(css,/\.live-bid-name\{[^}]*white-space:normal!important/);assert.match(css,/var\(--bid-name-units,8\)/);
});
test('a national lower-third caption grows above its saved bottom edge without changing state or other themes',()=>{
 const ctx=renderer(['pageTwoInfoTraits','pageTwoInlineInfo','pageTwo'],{CreoBroadcastStandby:require('../public/broadcast-standby'),channelId:'national-cre',editorMode:false,CreoBroadcastProfiles:{resolve:()=>({settings:{page2InfoLayout:'inline-traits'}})},vendorLogo:()=>'',pageTwoProgress:()=>'',pageTwoBidders:()=>'',pageTwoParents:()=>'',banner:()=>'',showBanner:()=>false,pageTicker:()=>''});
 const state={mode:'live',activeItemId:'test',layoutPlacements:{'p2-info':{x:4,y:78,width:73,height:9}}},items=[{id:'test',name:'긴 개체 이름',status:'live',note:'비고'}],before=JSON.stringify(state);
 assert.match(ctx.pageTwo({broadcastTheme:'national-stage'},state,items,[]),/is-lower-caption/);assert.equal(JSON.stringify(state),before);
 assert.doesNotMatch(ctx.pageTwo({broadcastTheme:'base'},state,items,[]),/is-lower-caption/);
 assert.doesNotMatch(ctx.pageTwo({broadcastTheme:'national-stage'},{...state,layoutPlacements:{'p2-info':{y:5}}},items,[]),/is-lower-caption/);
 assert.match(css,/\.is-lower-caption\[data-layout-custom="1"\]\{top:auto!important;bottom:calc\(100% - var\(--layout-y\) - var\(--layout-height\)\)!important/);
 // Two-line result names must fit the row itself, not the height of the whole board.
 assert.match(css,/\.summary-row\{container-type:size/);assert.match(css,/font-size:min\(\.84em,calc\(\(100cqh - 16px\) \/ 2\.4\)\)/);
});
