'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require('linkedom'),list=require('../public/workspace-item-list');
const context=(extra={})=>({channelId:'round-a',vendors:[{id:'v1',name:'가상 업체'},{id:'v2',name:'다른 업체'}],items:[{id:'b',lotNumber:3,name:'B03',vendorId:'v2',status:'sold',soldPrice:120000,winnerName:'가상 구매자/01000000000'},{id:'a',lotNumber:1,name:'A01',vendorId:'v1',category:'릴리화이트',status:'waiting'},{id:'e',lotNumber:2,name:'E01',vendorId:'v1',status:'cancelled'}],money:n=>n.toLocaleString('ko'),buyerName:n=>String(n||'').split('/')[0],statusName:s=>({waiting:'대기',sold:'낙찰',cancelled:'취소'})[s]||'상태 확인 필요',actions:(_,id)=>`<button data-edit="items:${id}">수정</button>`,groupName:()=>'',...extra});
test('filters retain real auction order, exact vendor, status and item identity without changing records',()=>{
    const c=context(),before=JSON.stringify(c.items);
    assert.deepEqual(list.select(c).map(i=>i.id),['a','e','b']);
    assert.deepEqual(list.select(c,{query:'가상 a01'}).map(i=>i.id),['a']);
    assert.deepEqual(list.select(c,{query:'구매자 b03'}).map(i=>i.id),['b']);
    assert.deepEqual(list.select(c,{vendor:'v1',status:'sold'}),[]);
    assert.deepEqual(list.select(c,{status:'cancelled'}).map(i=>i.id),['e']);
    assert.equal(list.select(c,{query:'01000000000'}).length,0);
    assert.equal(JSON.stringify(c.items),before);
});
test('responsive table preserves escaped names, financial display and precise edit targets',()=>{
    const c=context();c.items[1].name='<img src=x>';c.items[1].category='<script>bad</script>';
    const {document}=parseHTML(list.table(c));
    assert.equal(document.querySelector('script,img'),null);
    assert.equal(document.querySelector('[data-item-id="a"] [data-edit]').getAttribute('data-edit'),'items:a');
    assert.match(document.querySelector('[data-item-id="b"]').textContent,/120,000원/);
    assert.doesNotMatch(document.toString(),/01000000000/);
    assert.equal(document.querySelectorAll('thead th').length,5);
    assert.equal(document.querySelectorAll('tbody th[scope="row"]').length,3);
    assert.equal(document.querySelector('caption').textContent,'선택한 회차의 경매 진행 순서');
    c.items[1].teamName='팀 A';assert.match(list.table(c),/팀 A/);
    assert.equal(parseHTML(list.table(c)).document.querySelectorAll('thead th').length,6);
});
function fixture(){
    const {document}=parseHTML('<html><body><section id="item-list-tools"></section></body></html>');let changes=[];
    const controller=list.create({document,onChange:html=>changes.push(html)});
    for(const id of ['item-list-vendor','item-list-status']){const el=document.getElementById(id);let value='';Object.defineProperty(el,'value',{get:()=>value,set:v=>{value=v;}});}
    let focus='';document.getElementById('item-list-query').focus=()=>{focus='query';};
    const change=(id,value,event)=>{const el=document.getElementById(id);el.value=value;el[event]();};
    return {document,controller,changes,change,focus:()=>focus};
}
test('query and filters survive same-round refresh but reset before another round is rendered',()=>{
    const f=fixture(),c=context();f.controller.render(c);
    f.change('item-list-query','B03','oninput');f.change('item-list-vendor','v2','onchange');
    assert.match(f.changes.at(-1),/items:b/);assert.doesNotMatch(f.changes.at(-1),/items:a/);
    assert.match(f.controller.render({...c,items:c.items.map(i=>i.id==='b'?{...i,name:'B03 updated'}:i)}),/B03 updated/);
    assert.equal(f.document.getElementById('item-list-query').value,'B03');
    const next=f.controller.render(context({channelId:'round-b',items:[{id:'next',name:'A01',lotNumber:1,vendorId:'v1',status:'waiting'}]}));
    assert.match(next,/items:next/);assert.doesNotMatch(next,/items:b/);assert.equal(f.document.getElementById('item-list-query').value,'');
    assert.equal(f.document.getElementById('item-list-vendor').value,'');
});
test('no-result recovery restores the complete list and keyboard focus without a request',()=>{
    const f=fixture();f.controller.render(context());f.change('item-list-query','없는 개체','oninput');
    assert.match(f.changes.at(-1),/조건에 맞는 개체가 없어요/);assert.equal(f.document.getElementById('item-list-reset').hidden,false);
    f.document.getElementById('item-list-reset').onclick();
    assert.equal(parseHTML(f.changes.at(-1)).document.querySelectorAll('[data-item-id]').length,3);
    assert.equal(f.focus(),'query');assert.equal(f.document.getElementById('item-list-reset').hidden,true);
    assert.match(list.table(context({items:[]})),/아직 편성된 개체가 없어요/);
});
test('list includes missing vendor references and unknown statuses without silently dropping them',()=>{
    const f=fixture(),c=context({vendors:[],items:[{id:'legacy',name:'B16',vendorId:'gone',vendorName:'이전 업체',status:'unexpected'}]});
    f.controller.render(c);assert.match(f.document.getElementById('item-list-vendor').textContent,/이전 업체/);
    f.change('item-list-vendor','gone','onchange');f.change('item-list-status','other','onchange');
    assert.match(f.changes.at(-1),/items:legacy/);assert.match(f.changes.at(-1),/상태 확인 필요/);
    f.controller.render(context());assert.equal(f.document.getElementById('item-list-vendor').value,'');
});
test('workspace scopes vendor controls and keeps broadcast transitions behind an initially closed disclosure',()=>{
    const html=fs.readFileSync(require.resolve('../public/channel-workspace.html'),'utf8'),{document}=parseHTML(html);
    const panel=document.getElementById('live-panel');assert.equal(panel.tagName,'DETAILS');assert.equal(panel.hasAttribute('open'),false);assert.equal(panel.querySelectorAll('.live-mode').length,3);
    const source=html.slice(html.indexOf('function render(){'),html.indexOf('async function deleteRecord'));
    const ctx=vm.createContext({window:{},document,tab:'items',channelId:'round-a',selectedChannel:()=>({}),term:(_,fallback)=>fallback,$:id=>document.getElementById(id),data:{items:[],vendors:[],shipments:[]},itemList:{render:()=>'<p>Items</p>'},groupName:()=>'',statusName:()=>'',actions:()=>'',CreoPlatform:{money:()=>''},CreoMobilePhone:{buyerDisplayName:()=>''},bindTableActions(){},Event:document.defaultView.Event,CreoWorkspaceVendorTable:{render:()=>'<p>Vendors</p>'}});
    const focusSource=html.slice(html.indexOf('function restoreItemFocus('),html.indexOf('const itemEditor='));
    vm.runInContext(focusSource+source+';render();',ctx);
    assert.equal(document.getElementById('shared-vendors').hidden,true);assert.equal(document.getElementById('manage-vendor-links').hidden,true);assert.equal(document.getElementById('item-list-tools').hidden,false);
    ctx.tab='vendors';ctx.render();assert.equal(document.getElementById('shared-vendors').hidden,false);assert.equal(document.getElementById('item-list-tools').hidden,true);
});
