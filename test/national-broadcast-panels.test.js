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
test('national panel overrides are restricted to P1/P3, preserve transparency, and beat shared forced styles',()=>{
 for(const match of css.matchAll(/([^{}]+)\{/g)){const selector=match[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();assert.match(selector,/body\[data-broadcast-theme="national-stage"\]\[data-page="[13]"\]/);}
 assert.doesNotMatch(css,/url\(|animation:|transition:/);assert.match(css,/\.host-name\{[^}]*font-size:[^;]+!important/);
 assert.match(css,/\.ranking-page\{[^}]*color:#43505a!important/);assert.ok(html.indexOf('broadcast-national.css')>html.indexOf('broadcast-themes.css'));
});
test('national caption and board color pairs meet text contrast requirements',()=>{
 const luminance=hex=>{const c=hex.match(/\w\w/g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};
 for(const [fg,bg] of [['253640','fffaf0'],['253640','f4d984'],['43505a','e9e3d6'],['fffaf0','285779'],['5a615e','fffaf0']]){const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,fg+'/'+bg+' '+ratio);}
});
