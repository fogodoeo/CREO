const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/vendor-checkout.html'),'utf8');
test('card link feedback distinguishes persistence from notification acceptance',()=>{const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function cardLinkFeedback('),html.indexOf('let workFilter=')),ctx);assert.match(ctx.cardLinkFeedback({failed:true}),/알림톡 발송 실패/);assert.match(ctx.cardLinkFeedback({status:'queued'}),/발송 대기/);assert.match(ctx.cardLinkFeedback({status:'sent'}),/접수 완료/);assert.match(ctx.cardLinkFeedback({status:'configuration_pending'}),/설정 확인/)});
const buyer=(status,method='bank_transfer',destination={address:'테스트'},cardPaymentUrl='')=>({payment:{status,method,cardPaymentUrl},destination});
function setup(buyers,channelStatus='active'){
 const nodes={},buttons=['action','waiting','paid','all'].map(filter=>({dataset:{filter},setAttribute(k,v){this[k]=v}})),cards=[{dataset:{stage:'action'},draft:'https://example.test/payment'},{dataset:{stage:'waiting'}},{dataset:{stage:'paid'}}];
 const ctx=vm.createContext({data:{channel:{id:'a',status:channelStatus},buyers},$:id=>nodes[id]??={},document:{querySelectorAll:s=>s==='[data-filter]'?buttons:cards}});
 vm.runInContext(html.slice(html.indexOf('let workFilter='),html.indexOf('function action(')),ctx);
 return{ctx,nodes,buttons,cards};
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
