'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/vendor-entry-app.js'),'utf8');
const markup=source.slice(source.indexOf('  function profileCardEnabled('),source.indexOf('  function bindProfileForm('));
const save=source.slice(source.indexOf('  async function saveProfile('),source.indexOf('  function radioGroup('));
function fixture(methods,checkbox){
 const fields=new Map(),sent=[];
 for(const id of ['phone','bank','account','holder','save','dialog-save','form'])fields.set('profile-'+id,{value:({bank:'가상은행',account:'000000',holder:'가상업체'})[id]||'',disabled:false,setAttribute(){},focus(){},querySelector(){return {}}});
 if(checkbox!==undefined)fields.set('profile-card',{checked:checkbox});
 const context=vm.createContext({Array,profile:{paymentMethods:methods,cardEnabled:!methods.includes('card'),directoryRevision:3},busy:false,profileSequence:0,eventId:'test',profileDirty:true,Store:{live:true},esc:x=>String(x??''),$:id=>fields.get(id),errorAt(){},toast(){},renderProfile:async()=>{},profileApi:async data=>{sent.push(data);return {paymentMethods:data.cardEnabled?['bank_transfer','card']:['bank_transfer']};},window:{CreoVendorContactForm:{markup:()=>'',read:()=>({phone:'01000000000'})}}});
 vm.runInContext(markup+save,context);
 return {context,sent,html:()=>context.profileFormMarkup(context.profile),save:()=>context.saveProfile(false)};
}
test('profile checkbox reflects paymentMethods from the real API, including explicit card-off',()=>{
 for(const methods of [['bank_transfer','card'],['bank_transfer'],[]]){
  const f=fixture(methods),input=f.html().match(/<input id="profile-card"[^>]*>/)[0];
  assert.equal(/\bchecked\b/.test(input),methods.includes('card'));
 }
});
test('first-profile popup preserves card preference although its checkbox is absent',async()=>{
 for(const methods of [['bank_transfer','card'],['bank_transfer'],[]]){
  const f=fixture(methods);assert.doesNotMatch(f.context.profileFormMarkup(f.context.profile,true),/id="profile-card"/);
  assert.equal(await f.save(),true);assert.equal(f.sent[0].cardEnabled,methods.includes('card'));assert.equal(f.sent[0].directoryRevision,3);
 }
});
test('explicit user toggle wins and subsequent render keeps the saved value',async()=>{
 for(const checked of [true,false]){
  const f=fixture(checked?['bank_transfer']:['bank_transfer','card'],checked);
  assert.equal(await f.save(),true);assert.equal(f.sent[0].cardEnabled,checked);
  assert.equal(/\bchecked\b/.test(f.html().match(/<input id="profile-card"[^>]*>/)[0]),checked);
 }
});
