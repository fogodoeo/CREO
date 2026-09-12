const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/shipping.html'),'utf8');
const source=html.slice(html.indexOf('async function openActiveBuyerPage()'),html.indexOf('async function sendBuyerShippingLinkSms()'));
function setup({blocked=false,fail=false,url='https://example.test/d/buyer123456'}={}){
 const calls=[],opened=[],errors=[];let closed=false;
 const popup={opener:{},location:{replace:value=>opened.push(value)},close:()=>closed=true};
 const ctx=vm.createContext({URL,SHIPPING_CHANNEL_ID:'channel-a',activeBuyerLinkItem:()=>({_platformItemId:'sold-1'}),showToast:msg=>errors.push(msg),window:{location:{origin:'https://example.test'},open:()=>blocked?null:popup},CreoPlatform:{api:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});if(fail)throw Error('failed');return{url}}}});
 ctx.location=ctx.window.location;
 vm.runInContext(fs.readFileSync(require.resolve('../public/buyer-link-manager.js'),'utf8'),ctx);
 ctx.CreoBuyerLinkManager=ctx.window.CreoBuyerLinkManager;
 vm.runInContext(source,ctx);return{ctx,calls,opened,errors,popup,isClosed:()=>closed};
}
test('operator opens both current /d and legacy /s buyer links without SMS or shipping writes',async()=>{
 for(const prefix of ['d','s']){
 const url=`https://example.test/${prefix}/buyer123456`,s=setup({url});await s.ctx.openActiveBuyerPage();
 assert.deepEqual(s.calls,[{path:'channels/channel-a/buyer-shipping-link',body:{itemId:'sold-1'}}]);
 assert.deepEqual(s.opened,[url]);assert.equal(s.popup.opener,null);
 assert.match(html,/id="editor-buyer-page-btn"/);
 }
});
test('blocked popup does not request a link',async()=>{const s=setup({blocked:true});await s.ctx.openActiveBuyerPage();assert.equal(s.calls.length,0);assert.equal(s.errors.length,1)});
test('API failure and invalid destination close the blank tab',async()=>{
 for(const options of [{fail:true},{url:'https://other.test/s/buyer123456'},{url:'javascript:alert(1)'},{url:'https://example.test/settings.html'}]){const s=setup(options);await s.ctx.openActiveBuyerPage();assert.equal(s.opened.length,0);assert.equal(s.isClosed(),true);assert.equal(s.errors.length,1)}
});
