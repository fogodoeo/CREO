'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/channel-workspace.html'),'utf8');
const source=html.slice(html.indexOf('function field('),html.indexOf('function closeModal('));
function render(groups){const nodes={};const ctx={channelId:'fixture',selectedChannel:()=>({features:{groups}}),term:(_,fallback)=>fallback,esc:s=>String(s??''),groupOptions:()=>'',data:{vendors:[]},$:id=>nodes[id]||=( {} )};vm.createContext(ctx);vm.runInContext(source+';openModal("vendors");',ctx);return nodes['record-fields'].innerHTML}
test('standard auction vendor form omits team-only controls; team auction keeps them',()=>{assert.doesNotMatch(render(false),/contributionRate|groupId|팀장/);assert.match(render(true),/contributionRate/);assert.match(render(true),/groupId/)});
test('every generated vendor control has an associated label',()=>{for(const groups of [false,true]){const markup=render(groups);for(const match of markup.matchAll(/<(?:input|select|textarea) id="([^"]+)"/g))assert.ok(markup.includes('label for="'+match[1]+'"'),match[1]);assert.equal((markup.match(/<(?:input|select|textarea) /g)||[]).length,(markup.match(/label for=/g)||[]).length)}});
test('opening and saving schedule settings preserves explicitly blank origins',()=>{
 const nodes={},ctx={document:{getElementById:id=>nodes[id]||={},addEventListener(){}}};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/delivery-schedule-settings.js'),'utf8'),ctx);
 vm.runInContext('fillDeliverySchedule({shippingDefaults:{deliverySchedule:{enabled:false,pargeOrigin:"",dodosiOrigin:""}}});result=readDeliverySchedule();',ctx);
 assert.equal(ctx.result.pargeOrigin,'');assert.equal(ctx.result.dodosiOrigin,'');assert.equal(ctx.result.enabled,false);
});
