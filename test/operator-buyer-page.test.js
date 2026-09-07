const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/shipping.html'),'utf8');
const source=html.slice(html.indexOf('async function openActiveBuyerPage()'),html.indexOf('async function sendBuyerShippingLinkSms()'));
function setup({blocked=false,fail=false,url='https://example.test/s/buyer1'}={}){
 const calls=[],opened=[],errors=[];let closed=false;
 const popup={opener:{},location:{replace:value=>opened.push(value)},close:()=>closed=true};
 const ctx=vm.createContext({URL,SHIPPING_CHANNEL_ID:'channel-a',activeBuyerLinkItem:()=>({_platformItemId:'sold-1'}),showToast:msg=>errors.push(msg),window:{location:{origin:'https://example.test'},open:()=>blocked?null:popup},CreoPlatform:{api:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});if(fail)throw Error('failed');return{url}}}});
 vm.runInContext(source,ctx);return{ctx,calls,opened,errors,popup,isClosed:()=>closed};
}
test('operator opens selected buyer link without navigating to SMS or saving shipping',async()=>{
 const s=setup();await s.ctx.openActiveBuyerPage();
 assert.deepEqual(s.calls,[{path:'channels/channel-a/buyer-shipping-link',body:{itemId:'sold-1'}}]);
 assert.deepEqual(s.opened,['https://example.test/s/buyer1']);assert.equal(s.popup.opener,null);
 assert.match(html,/id="editor-buyer-page-btn"/);
});
test('blocked popup does not request a link',async()=>{const s=setup({blocked:true});await s.ctx.openActiveBuyerPage();assert.equal(s.calls.length,0);assert.equal(s.errors.length,1)});
test('API failure and invalid destination close the blank tab',async()=>{
 for(const options of [{fail:true},{url:'https://other.test/s/buyer1'}]){const s=setup(options);await s.ctx.openActiveBuyerPage();assert.equal(s.opened.length,0);assert.equal(s.isClosed(),true);assert.equal(s.errors.length,1)}
});
