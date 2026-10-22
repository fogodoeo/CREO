'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function screen(){
 const all=[];
 function element(tag='div'){
  const node={tag,children:[],hidden:false,attributes:{},textContent:'',firstChild:{textContent:''},parentElement:null,
   setAttribute(k,v){this.attributes[k]=v},
   remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null},
   append(...items){for(const item of items){item.remove();item.parentElement=this;this.children.push(item)}},
   prepend(...items){for(const item of items)item.remove();for(const item of items)item.parentElement=this;this.children.unshift(...items)},
   closest(name){return this.tag===name?this:this.parentElement?.closest(name)}
  };all.push(node);return node;
 }
 const main=element('main'),title=element('h2'),filters=element('nav'),buyers=element(),empty=element(),filterEmpty=element(),settlement=element();
 title.className='work-title';filters.className='work-filters';buyers.id='buyers';empty.id='empty';filterEmpty.id='filter-empty';settlement.id='shipping-settlement';
 main.append(title,filters,buyers,filterEmpty,empty,settlement);
 const connected=n=>n===main||!!n.parentElement&&connected(n.parentElement);
 const document={createElement:element,getElementById:id=>all.find(n=>n.id===id&&connected(n)),querySelector:selector=>all.find(n=>n.className===selector.slice(1)&&connected(n))};
 const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../public/vendor-finance-view.js'),'utf8'),{window,document});
 const data={channel:{id:'national-cre'},round:{key:'date:2026-10-19'},vendor:{id:'v'},buyers:[{id:'buyer'}],shippingSettlement:{bank:{bankAccount:'000'},notificationReady:true,vendors:[{vendorId:'v',remainingAmount:66000}]}};
 const counts={all:1,action:0,waiting:1,paid:0};
 return {data,counts,main,document,title,filters,buyers,settlement,update:()=>window.CreoVendorFinance.update(data,counts),buttons:()=>document.querySelector('.vendor-finance-nav').children};
}

test('a vendor with money to remit sees organizer work even when no buyer payment needs confirmation',()=>{
 const f=screen(),before=JSON.stringify(f.data);let confirmCalled=0;f.settlement.onclick=()=>confirmCalled++;
 f.update();const [buyers,organizer]=f.buttons();
 assert.equal(buyers.attributes['aria-pressed'],'false');assert.equal(organizer.attributes['aria-pressed'],'true');
 assert.equal(organizer.children[1].textContent,'보낼 금액 66,000원');assert.equal(f.document.getElementById('vendor-buyer-work').hidden,true);
 assert.equal(f.settlement.parentElement.id,'vendor-organizer-work');f.settlement.onclick();assert.equal(confirmCalled,1);
 assert.equal(JSON.stringify(f.data),before,'task navigation never changes financial data');
});

test('actionable buyer payment takes priority and changing tasks preserves existing buyer controls',()=>{
 const f=screen();f.counts.action=1;f.counts.waiting=0;f.update();const [buyers,organizer]=f.buttons();
 assert.equal(buyers.attributes['aria-pressed'],'true');assert.equal(buyers.children[1].textContent,'확인 필요 1건');
 assert.equal(f.buyers.parentElement.id,'vendor-buyer-work');assert.equal(f.filters.parentElement.id,'vendor-buyer-work');
 organizer.onclick();assert.equal(f.document.getElementById('vendor-organizer-work').hidden,false);
 f.update();assert.equal(organizer.attributes['aria-pressed'],'true','same-round refresh preserves chosen task');
 f.data.round.key='archive:old';f.update();assert.equal(buyers.attributes['aria-pressed'],'true','another round chooses its own next task');
 assert.equal(f.main.children.filter(n=>n.className==='vendor-finance-nav').length,1,'refresh does not duplicate controls');
});

test('pending or incomplete organizer work never reads as completed and no state update reports a payment',()=>{
 const f=screen(),row=f.data.shippingSettlement.vendors[0];
 for(const [changes,label] of [
  [{pendingReport:{amount:66000}},'입금 확인 중'],
  [{pendingReport:null,unassignedReceiptCount:1},'기존 입금 확인 중'],
  [{unassignedReceiptCount:0,remainingAmount:0,overpaidAmount:3000},'초과 입금 확인 필요'],
  [{overpaidAmount:0,missingDestinationItems:[{id:'a'}]},'배송비 확인 중'],
  [{missingDestinationItems:[]},'정산 완료']
 ]){Object.assign(row,changes);f.update();assert.equal(f.buttons()[1].children[1].textContent,label)}
 assert.equal(row.remainingAmount,0);
});

test('rounds without organizer work show buyer content directly and round changes can restore both tasks',()=>{
 const f=screen();f.settlement.remove();delete f.data.shippingSettlement;f.update();
 assert.equal(f.document.querySelector('.vendor-finance-nav').hidden,true);assert.equal(f.document.getElementById('vendor-buyer-work').hidden,false);
 assert.equal(f.title.hidden,false);assert.equal(f.title.firstChild.textContent,'확인할 결제 ');
 f.data.round.key='date:2026-10-21';f.data.buyers=[];f.counts.all=0;f.counts.waiting=0;
 f.data.shippingSettlement={bank:{},vendors:[{vendorId:'v',remainingAmount:10000}]};f.main.append(f.settlement);f.update();
 assert.equal(f.document.querySelector('.vendor-finance-nav').hidden,false);assert.equal(f.buttons()[1].attributes['aria-pressed'],'true');
 assert.equal(f.buttons()[0].children[1].textContent,'낙찰 내역 없음');
});
