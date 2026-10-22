'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const source=fs.readFileSync(require.resolve('../public/organizer-bookings.js'),'utf8');
const functions=source.slice(source.indexOf('  async function load()'),source.indexOf('  async function save('))+source.slice(source.indexOf('  function regionsForm()'),source.indexOf('  function reservationForm('));
function page(search){
 const {document}=parseHTML('<html><body><div id="body"></div><p id="admin-status"></p><a id="organizer-home"></a></body></html>');
 const data={version:1,vendors:[{id:'v1',name:'가상 업체',region:3}],regions:['서울·인천','경기','전라·충청','대구·경북','부산·울산·경남']},calls=[];
 const context={document,query:new URLSearchParams(search),code:'',channel:'national-cre',busy:false,revision:0,initialActionDone:false,state:null,esc:String,$:id=>document.getElementById(id),error(){},render(){},route:()=>'',api:async()=>data,save:async body=>{calls.push(body);context.state={...data,vendors:[{...data.vendors[0],region:body.region}]};return true;},open:(_title,html)=>{document.getElementById('body').innerHTML=html;for(const s of document.querySelectorAll('select'))Object.defineProperty(s,'value',{value:'',writable:true});}};
 vm.runInNewContext(functions,context);return{context,document,calls};
}
test('program region menu opens directly without a preselected vendor, and an individual company link selects it',async()=>{
 for(const vendor of ['', '&vendor=v1']){const f=page('?action=region'+vendor);await f.context.load();assert.ok(f.document.getElementById('region-form'));assert.equal(f.document.getElementById('region-vendor').value,vendor?'v1':'');if(vendor)assert.equal(f.document.getElementById('region-choice').value,3);}
});
test('saving region keeps the selected company, announces the result and preserves inputs when saving fails',async()=>{
 const f=page('?action=region&vendor=v1');await f.context.load();const $=f.context.$;
 $('region-choice').value='4';await $('region-form').onsubmit({preventDefault(){}});
 assert.equal(f.calls[0].vendorId,'v1');assert.equal(f.calls[0].region,4);assert.equal($('region-vendor').value,'v1');assert.equal($('region-choice').value,'4');assert.match($('region-save-status').textContent,/가상 업체 · 부산·울산·경남 저장했습니다/);
 f.context.save=async()=>false;$('region-choice').value='3';await $('region-form').onsubmit({preventDefault(){}});
 assert.equal($('region-choice').value,'3');assert.equal($('region-save-status').textContent,'');
});
