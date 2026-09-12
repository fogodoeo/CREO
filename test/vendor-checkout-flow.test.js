const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8');
test('vendor event selector is visible for multiple events and hidden for a single event',()=>{
 const select={parentElement:{},options:[],replaceChildren(){this.options=[]},append(option){this.options.push(option)}};
 const ctx=vm.createContext({data:{channel:{id:'a',name:'A',status:'active'}},$:()=>select,document:{createElement:()=>({})}});
 vm.runInContext(html.slice(html.indexOf('function renderEvents('),html.indexOf("$('vendor-event').onchange")),ctx);
 ctx.renderEvents();assert.equal(select.parentElement.hidden,true);
 ctx.data.events=[ctx.data.channel,{id:'b',name:'B',status:'archived'}];ctx.renderEvents();
 assert.equal(select.parentElement.hidden,false);assert.equal(select.options.length,2);assert.equal(select.options[0].selected,true);
});
test('card link feedback distinguishes persistence from notification acceptance',()=>{const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function cardLinkFeedback('),html.indexOf('let workFilter=')),ctx);assert.match(ctx.cardLinkFeedback({failed:true}),/알림톡 발송 실패/);assert.match(ctx.cardLinkFeedback({status:'queued'}),/발송 대기/);assert.match(ctx.cardLinkFeedback({status:'sent'}),/접수 완료/);assert.match(ctx.cardLinkFeedback({status:'configuration_pending'}),/설정 확인/)});
const buyer=(status,method='bank_transfer',destination={address:'테스트'},cardPaymentUrl='')=>({payment:{status,method,cardPaymentUrl},destination});
function setup(buyers,channelStatus='active'){
 const nodes={},buttons=['action','waiting','paid','all'].map(filter=>({dataset:{filter},setAttribute(k,v){this[k]=v}})),cards=[{dataset:{stage:'action'},draft:'https://example.test/payment'},{dataset:{stage:'waiting'}},{dataset:{stage:'paid'}}];
 const events={};
 const ctx=vm.createContext({data:{channel:{id:'a',status:channelStatus},buyers},$:id=>nodes[id]??={},document:{querySelectorAll:s=>s==='[data-filter]'?buttons:cards},window:{addEventListener:(name,listener)=>events[name]=listener},busy:false,hasDraft:()=>false,confirm:()=>false});
 vm.runInContext(html.slice(html.indexOf('let workFilter='),html.indexOf('function renderVendorContacts(')),ctx);
 return{ctx,nodes,buttons,cards,events};
}
test('only reported payments and missing card links need vendor action',()=>{
 const s=setup([]);
 for(const [b,expected] of [[buyer('bank_transfer_reported'),'action'],[buyer('card_payment_reported','card',{},'https://example.test'),'action'],[buyer('card_link_pending','card'),'action'],[buyer('awaiting_information','bank_transfer',null),'waiting'],[buyer('bank_transfer_pending'),'waiting'],[buyer('paid'),'paid']])assert.equal(s.ctx.workStage(b),expected);
});
test('filter changes retain existing cards and card-link drafts',()=>{
 const s=setup([buyer('bank_transfer_reported'),buyer('paid')]);s.ctx.renderWorkFilters();assert.equal(s.buttons[0]['aria-pressed'],'true');assert.equal(s.cards[2].hidden,true);s.buttons[2].onclick();assert.equal(s.cards[2].hidden,false);assert.equal(s.cards[0].draft,'https://example.test/payment');assert.equal(s.nodes['action-count'].textContent,'1건');
 s.ctx.data.buyers=[];s.ctx.renderWorkFilters();assert.equal(s.nodes['filter-empty'].hidden,true);
});
test('event switch resets filters and archived records do not appear actionable',()=>{const s=setup([buyer('bank_transfer_reported')]);s.ctx.renderWorkFilters();s.ctx.data.channel={id:'b',status:'archived'};s.ctx.renderWorkFilters();assert.equal(s.buttons[1]['aria-pressed'],'true');assert.equal(s.nodes['action-count'].textContent,'0건')});
test('menu navigation preserves unfinished payment work unless explicitly discarded',()=>{
 const s=setup([]),navigate=()=>{let prevented=false;s.events['vendor-before-navigation']({preventDefault(){prevented=true}});return prevented};
 assert.equal(navigate(),false);
 s.ctx.hasDraft=()=>true;assert.equal(navigate(),true);
 s.ctx.confirm=()=>true;assert.equal(navigate(),false);
 s.ctx.busy=true;assert.equal(navigate(),true);
});
test('vendors can confirm actual bank or card payments even if the buyer never reported them',()=>{
 const ctx=vm.createContext({data:{channel:{status:'active'}},esc:String,money:n=>String(n),cancellationAction:()=>'<cancellation>'});
 vm.runInContext(html.slice(html.indexOf('function action('),html.indexOf('function render(){')),ctx);
 for(const [method,url] of [['bank_transfer',''],['card','https://pay.example.test/one']]){
  const value={id:'buyer',destination:{address:'예시'},payment:{status:method==='card'?'card_payment_pending':'bank_transfer_pending',method,cardPaymentUrl:url}};
  assert.match(ctx.action(value),/data-confirm="buyer"/);assert.match(ctx.action(value),/직접 확인/);
  assert.equal(ctx.action({...value,destination:null}),'');
  assert.equal(ctx.action({...value,payment:{...value.payment,status:'paid'}}),'');
  assert.doesNotMatch(ctx.action({...value,changePending:true}),/data-confirm/);
  assert.equal(ctx.action({...value,payment:{...value.payment,cardLinkCancellationRequired:true}}),'<cancellation>');
  ctx.data.channel.status='archived';assert.doesNotMatch(ctx.action(value),/data-confirm/);ctx.data.channel.status='active';
 }
});
