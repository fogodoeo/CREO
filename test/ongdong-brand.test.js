const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const brand=require('../public/ongdong-brand');
test('brand watermark is restricted to P1/P2 and uses the supplied full logo',()=>{
    for(const page of [1,2]){assert.match(brand.broadcast(page),/assets\/ongdong2\/logo.png/);assert.ok(brand.broadcast(page).includes('ong-page-'+page));}
    assert.equal(brand.broadcast(3),'');assert.equal(brand.broadcast('invalid'),'');
    assert.match(brand.header(),/symbol.png/);assert.match(brand.header(),/옹동2/);
});
test('broadcast applies saved logo coordinates, opacity zero and hidden state on each page',()=>{
    const html=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
    for(const page of [1,2]){
        const props={},element={dataset:{},style:{setProperty:(k,v)=>props[k]=v}};
        const ctx=vm.createContext({page,window:{},stage:{querySelector:selector=>selector==='.ongdong-watermark'?element:null}});
        vm.runInContext(html.slice(html.indexOf('const layoutSelectors='),html.indexOf('const renderSources=')),ctx);
        ctx.applyLayoutPlacements({layoutPlacements:{['p'+page+'-brand']:{x:13,y:21,width:8,height:17,fontScale:1,opacity:0,visible:false}}});
        assert.equal(element.dataset.layoutSlot,'p'+page+'-brand');assert.equal(element.dataset.layoutHidden,'1');
        assert.equal(props['--layout-x'],'13%');assert.equal(props['--layout-y'],'21%');
        assert.equal(props['--layout-width'],'8%');assert.equal(props['--layout-height'],'17%');assert.equal(props['--layout-opacity'],'0');
    }
});
