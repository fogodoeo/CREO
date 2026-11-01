'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context=vm.createContext({esc,banner:()=>'',showBanner:()=>false,pageTicker:()=>''});
vm.runInContext(source.slice(source.indexOf('function hostCaptionRole('),source.indexOf('function activeItem(')),context);

test('Jjunine renders each host identity with its own Instagram handle; renamed or removed hosts do not keep stale identity',()=>{
 const channel={broadcastTheme:'jjun-boutique'},state={hostName1:'이승준',hostRole1:'@jjunes_9',hostName2:'크레초아',hostRole2:'@cre.coa05'};
 const first=context.pageOne(channel,state,[]);
 assert.match(first,/이승준/);assert.match(first,/크레초아/);
 assert.equal((first.match(/class="host-instagram"/g)||[]).length,2);
 assert.match(first,/aria-label="Instagram @jjunes_9"/);assert.match(first,/aria-label="Instagram @cre.coa05"/);
 const changed=context.pageOne(channel,{...state,hostRole1:'대표',hostName2:''},[]);
 assert.doesNotMatch(changed,/host-instagram|jjunes_9|cre.coa05|크레초아/);
 assert.match(changed,/<small class="host-role">대표<\/small>/);
 assert.doesNotMatch(context.pageOne(channel,{...state,page1HostsOn:false},[]),/host-card|host-instagram/);
});

test('handles stay escaped display text and unrelated themes retain their existing role markup',()=>{
 for(const invalid of ['@bad"><img src=x>','@','@'+ 'a'.repeat(31)]){
  const markup=context.hostCaptionRole(invalid,'jjun-boutique');
  assert.doesNotMatch(markup,/<svg|<img|<a /);
 }
 const ordinary=context.hostCaptionRole('@jjunes_9','clab-gallery');
 assert.equal(ordinary,'<small class="host-role">@jjunes_9</small>');
 assert.match(context.hostCaptionRole('@cre.coa05','jjun-boutique'),/aria-hidden="true" focusable="false"/);
});
