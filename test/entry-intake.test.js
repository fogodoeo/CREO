'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../public/entry-intake'),{create}=require('../public/workspace-entry-intake');
const now=Date.parse('2026-10-14T12:00:00+09:00');
function fixture(id='national-cre'){return {channel:{id,status:'active'},policy:{open:true},allocation:[],groups:[{vendor:{id:'v1',name:'가상업체'},media:[],parents:[],entries:[{id:'today',code:'개체 1',status:'submitted',version:1,broadcastDate:'2026-10-14',submission:{sex:'female',weight:'20',hatchDate:'2026-01-01',note:'오늘 정보'}},{id:'future',code:'개체 1',status:'submitted',version:1,broadcastDate:'2026-10-19',submission:{sex:'male',weight:'15',note:'다음 방송 정보'}},{id:'draft',code:'개체 2',status:'draft',version:1,broadcastDate:'2026-10-14',note:'미제출'}]}]};}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('Korean broadcast day handles UTC midnight, validates dates and preserves explicit all-date links',()=>{
 assert.equal(core.today(Date.parse('2026-10-13T15:00:00Z')),'2026-10-14');
 assert.equal(core.initialDate(fixture(),null,now),'2026-10-14');assert.equal(core.initialDate(fixture(),'all',now),'');
 assert.equal(core.initialDate(fixture('creyon'),null,now),'');assert.equal(core.validDate('2026-02-30'),false);assert.equal(core.validDate('2026-99-99'),false);
 assert.deepEqual(core.summarize(fixture(),'2026-10-14').counts,{submitted:1,draft:1,changes_requested:0,approved:0});
 assert.deepEqual(core.dates(fixture()),['2026-10-14','2026-10-19']);
 const url=new URL(core.reviewUrl('national-cre','2026-10-14','v1','draft'),'https://example.test');
 assert.equal(url.searchParams.get('vendor'),'v1');assert.equal(url.searchParams.get('status'),'draft');assert.equal(url.searchParams.get('broadcastDate'),'2026-10-14');
});
function panelHarness(api){const events={},panel={hidden:true,innerHTML:'',addEventListener:(type,handler)=>events[type]=handler};const control=create({document:{getElementById:()=>panel},client:{api,escapeHtml:esc},core,now:()=>now});return {panel,events,control};}
test('round workspace reads the canonical intake but shows only its date, even across refresh and late replies',async()=>{
 const paths=[],pending=[],h=panelHarness(path=>{paths.push(path);return new Promise(resolve=>pending.push(resolve));});
 const round={id:'national-cre-20261019',nationalRound:{parentId:'national-cre',date:'2026-10-19'}};
 const read=h.control.update({channelId:round.id,channel:round,tab:'items'});pending.shift()(fixture());await read;
 assert.deepEqual(paths,['channels/national-cre/entries']);assert.match(h.panel.innerHTML,/다음 방송 정보/);assert.doesNotMatch(h.panel.innerHTML,/오늘 정보|<select/);
 assert.match(h.panel.innerHTML,/channel=national-cre&amp;broadcastDate=2026-10-19/);
 h.events.change({target:{matches:()=>true,value:''}});assert.doesNotMatch(h.panel.innerHTML,/오늘 정보/);
 const stale=h.control.refresh(),next=h.control.update({channelId:'creyon',tab:'items'});pending.shift()(fixture());await stale;pending.shift()(fixture('creyon'));await next;
 assert.match(h.panel.innerHTML,/channel=creyon/);assert.doesNotMatch(h.panel.innerHTML,/channel=national-cre/);
});
test('workspace shows unapproved entries with review links and escapes vendor content',async()=>{
 const data=fixture();data.groups[0].vendor.name='<img onerror=alert(1)>';
 const h=panelHarness(async()=>data);await h.control.update({channelId:'national-cre',tab:'items'});
 assert.match(h.panel.innerHTML,/검토 대기 <strong>1<\/strong> · 작성 중 1/);assert.match(h.panel.innerHTML,/오늘 정보/);assert.doesNotMatch(h.panel.innerHTML,/다음 방송 정보|<img onerror/);assert.match(h.panel.innerHTML,/&lt;img/);
 h.events.change({target:{matches:()=>true,value:'2026-10-19'}});assert.match(h.panel.innerHTML,/다음 방송 정보/);assert.doesNotMatch(h.panel.innerHTML,/오늘 정보/);
 await h.control.refresh();assert.match(h.panel.innerHTML,/다음 방송 정보/,'refresh preserves chosen date');
});
test('late replies from a previous channel or tab cannot replace the current intake',async()=>{
 const pending=[];const h=panelHarness(()=>new Promise(resolve=>pending.push(resolve)));
 const first=h.control.update({channelId:'national-cre',tab:'items'}),second=h.control.update({channelId:'creyon',tab:'items'});
 pending[1](fixture('creyon'));await second;pending[0](fixture());await first;
 assert.match(h.panel.innerHTML,/channel=creyon/);assert.doesNotMatch(h.panel.innerHTML,/channel=national-cre/);
 const third=h.control.refresh();h.control.update({channelId:'creyon',tab:'vendors'});pending[2](fixture('creyon'));await third;assert.equal(h.panel.hidden,true);
});
test('load failure and wrong-channel responses show recoverable errors, never an empty success',async()=>{
 let attempt=0;const h=panelHarness(async()=>{if(attempt++===0)throw Error('연결 실패');if(attempt===2)return fixture('foreign');return fixture();});
 await h.control.update({channelId:'national-cre',tab:'items'});assert.match(h.panel.innerHTML,/role="alert"/);assert.match(h.panel.innerHTML,/다시 불러오기/);
 await h.control.refresh();assert.match(h.panel.innerHTML,/다른 채널/);await h.control.refresh();assert.match(h.panel.innerHTML,/오늘 정보/);
});
test('date-filtered review never offers a partial cross-date rearrangement',()=>{
 const data=fixture();data.groups[0].entries[0].itemId='a';data.groups[0].entries[1].itemId='b';data.allocation=[{id:'a',code:'1부 A01'},{id:'b',code:'1부 A02'}];
 const partOf=()=> '1부';assert.equal(core.arrangement(data,'2026-10-14','1부',partOf).scoped,false);assert.equal(core.arrangement(data,'','1부',partOf).scoped,true);
 data.allocation.pop();assert.equal(core.arrangement(data,'2026-10-14','1부',partOf).scoped,true);
});
async function reviewHarness(query='?channel=national-cre&broadcastDate=2026-10-14',override){
 const nodes={},calls=[],reads=[],data=fixture(),history=[],windowEvents={};
 function node(id){return nodes[id]||=( {id,value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',dataset:{},setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return []},querySelector(selector){return node(id+selector)},focus(){},append(){},showModal(){this.open=true},close(){this.open=false}} );}
 const buttons=['submitted','draft','changes_requested','approved'].map(status=>{const button=node('filter-'+status);button.dataset.status=status;return button;});
 node('filters').querySelectorAll=()=>buttons;node('batch-part').value='1부';
 const client={escapeHtml:esc,verifyAdmin:async()=>true,api:async(route,options)=>{if(options){calls.push({route,body:JSON.parse(options.body)});return {count:1,itemIds:[]};}reads.push(route);if(route.startsWith('channels?'))return {channels:[{...data.channel,dataAdapter:'platform'},{id:'national-cre-20261019',name:'가상 경기',dataAdapter:'platform',nationalRound:{parentId:'national-cre',date:'2026-10-19'}}]};const date=new URL(route,'https://example.test').searchParams.get('broadcastDate')||'';const response={...data,auctionTarget:{date,prepared:true,writable:true,channelId:date==='2026-10-19'?'national-cre-20261019':'national-cre'}};return override?override(response,reads):response;}};
 const context={window:{CreoPlatform:client,CreoEntryIntake:core,CreoEntryNumbering:require('../public/entry-numbering'),CreoCheckoutItemView:{createViewer:()=>({isOpen:()=>false,open(){}}),pictures:()=>[],traitSummary:()=>''},CreoEntryLabelPrint:{parentNames:()=>'',create:()=>({open(){}})},addEventListener:(type,fn)=>windowEvents[type]=fn},document:{getElementById:node,createElement:()=>node('created')},URL,URLSearchParams,location:{search:query,origin:'https://example.test',href:'https://example.test/vendor-entry-review.html'+query},history:{replaceState:(_a,_b,url)=>history.push(String(url))},crypto:{randomUUID:()=> 'isolated-request-00001'}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/vendor-entry-review.js'),'utf8'),context);await new Promise(setImmediate);
 return {nodes,calls,reads,data,history,windowEvents,clickFilter(status){node('filters').onclick({target:{closest:()=>node('filter-'+status)}})}};
}
test('changing review date clears selection, scoped batch approval sends only the selected date',async()=>{
 const h=await reviewHarness(),n=h.nodes;
 assert.match(n['entry-list'].innerHTML,/오늘 정보/);assert.doesNotMatch(n['entry-list'].innerHTML,/다음 방송 정보/);
 n['select-all'].onchange({target:{checked:true}});assert.equal(n['selection-count'].textContent,'1마리 선택');
 await n['review-date'].onchange({target:{value:'2026-10-19'}});assert.equal(n['selection-count'].textContent,'0마리 선택');assert.match(n['entry-list'].innerHTML,/다음 방송 정보/);
 n['select-all'].onchange({target:{checked:true}});await n['approve-selected'].onclick();assert.deepEqual(h.calls[0].body.entries.map(row=>row.id),['future']);
 assert.equal(h.calls[0].body.broadcastDate,'2026-10-19');assert.ok(h.reads.includes('channels/national-cre/entries?broadcastDate=2026-10-19'));
});
test('direct round review and changing the round both review canonical entries on the requested date',async()=>{
 const h=await reviewHarness('?channel=national-cre-20261019'),n=h.nodes;
 assert.equal(n['review-event'].value,'national-cre');assert.doesNotMatch(n['review-event'].innerHTML,/national-cre-20261019/);assert.match(n['entry-list'].innerHTML,/다음 방송 정보/);assert.doesNotMatch(n['entry-list'].innerHTML,/오늘 정보/);
 assert.match(n['workspace-link'].href,/channel=national-cre-20261019/);
 n['select-all'].onchange({target:{checked:true}});await n['approve-selected'].onclick();assert.equal(h.calls[0].route,'channels/national-cre/entries/batch');
 const old=await reviewHarness();old.nodes['review-event'].onchange({target:{value:'national-cre-20261019'}});await new Promise(setImmediate);
 assert.match(old.nodes['entry-list'].innerHTML,/다음 방송 정보/);assert.doesNotMatch(old.nodes['entry-list'].innerHTML,/오늘 정보/);
});

test('all-date and unprepared views never approve; explicit preparation precedes dated assignment',async()=>{
 const all=await reviewHarness('?channel=national-cre&broadcastDate=all');all.nodes['select-all'].onchange({target:{checked:true}});await all.nodes['approve-selected'].onclick();assert.equal(all.calls.length,0);assert.equal(all.nodes['batch-bar'].hidden,true);
 const h=await reviewHarness(undefined,response=>({...response,auctionTarget:{...response.auctionTarget,prepared:false,writable:false,channelId:''}}));
 assert.equal(h.nodes['prepare-round'].hidden,false);h.nodes['select-all'].onchange({target:{checked:true}});await h.nodes['approve-selected'].onclick();assert.equal(h.calls.length,0);
 await h.nodes['prepare-round'].onclick();assert.deepEqual(h.calls[0],{route:'national-rounds',body:{action:'prepare',date:'2026-10-14'}});
});

test('failed or wrong-date refresh clears stale actions and offers recovery',async()=>{
 let broken=false;const h=await reviewHarness(undefined,response=>{if(broken)throw Error('연결 실패 · 새로고침해 주세요.');return response});
 h.nodes['select-all'].onchange({target:{checked:true}});broken=true;await h.nodes.refresh.onclick();assert.equal(h.nodes['approve-selected'].disabled,true);assert.match(h.nodes['list-message'].textContent,/새로고침/);assert.doesNotMatch(h.nodes['entry-list'].innerHTML,/오늘 정보/);
 const wrong=await reviewHarness(undefined,response=>({...response,auctionTarget:{...response.auctionTarget,date:'2026-10-19'}}));assert.equal(wrong.nodes['approve-selected'].disabled,true);assert.match(wrong.nodes['list-message'].textContent,/다른 방송일/);
});

test('returning focus to the review frame cannot swallow the first selection click',async()=>{
 const h=await reviewHarness();h.windowEvents.focus?.();h.nodes['select-all'].onchange({target:{checked:true}});await new Promise(setImmediate);assert.equal(h.nodes['selection-count'].textContent,'1마리 선택');assert.equal(h.nodes['approve-selected'].disabled,false);
});
test('draft deep links show read-only details without selection or approval controls',async()=>{
 const h=await reviewHarness('?channel=national-cre&broadcastDate=2026-10-14&status=draft&vendor=v1'),n=h.nodes;
 assert.match(n['entry-list'].innerHTML,/미제출/);assert.doesNotMatch(n['entry-list'].innerHTML,/data-check/);assert.equal(n['batch-bar'].hidden,true);assert.equal(n['selection-bar'].hidden,true);
 const button={dataset:{entry:'draft',vendor:'v1'}};n['entry-list'].onclick({target:{closest:()=>button}});assert.equal(n['review-form'].hidden,true);assert.equal(n['review-actions'].hidden,true);
 await n['approve-selected'].onclick();assert.equal(h.calls.length,0);
});
