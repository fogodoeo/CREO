const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const brand=require('../public/ongdong-brand');
test('retired watermark stays absent while operator header keeps branding',()=>{
 for(const page of [1,2,3,'invalid'])assert.equal(brand.broadcast(page),'');
 assert.match(brand.header(),/symbol.png/);assert.match(brand.header(),/옹동2/);
});
test('obsolete brand placements cannot affect saved broadcast geometry',()=>{
 const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
 assert.doesNotMatch(html,/OngdongBrand|ongdong-watermark/);
 for(const page of [1,2]){
  const props={},element={dataset:{},style:{setProperty:(k,v)=>props[k]=v}},slot=page===1?'p1-host-1':'p2-bidders';
  const ctx=vm.createContext({page,window:{},stage:{querySelector:selector=>selector===(page===1?'.host-card[data-host-index="1"]':'.live-bidders')?element:null}});
  vm.runInContext(html.slice(html.indexOf('const layoutSelectors='),html.indexOf('const renderSources=')),ctx);
  ctx.applyLayoutPlacements({layoutPlacements:{['p'+page+'-brand']:{x:90,y:4,width:8,height:17},[slot]:{x:13,y:21,width:38,height:17,fontScale:1,opacity:0,visible:false}}});
  assert.equal(element.dataset.layoutSlot,slot);assert.equal(element.dataset.layoutHidden,'1');
  assert.equal(props['--layout-x'],'13%');assert.equal(props['--layout-width'],'38%');assert.equal(props['--layout-opacity'],'0');
 }
});
