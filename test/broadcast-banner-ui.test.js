'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/auction-live.html'),'utf8');
function loadFunction(context,name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),context)}
test('unchecked banners stay hidden and P3 never renders even editor placeholders',()=>{
 const context=vm.createContext({editorMode:false,esc:String,pageAssets:assets=>assets,isVideoAsset:()=>false,CreoBroadcastThemes:require('../public/broadcast-themes')});loadFunction(context,'banner');
 const assets=[{imageUrl:'/banner.png',name:'배너'}];
 assert.equal(context.banner(false,'',assets,1),'');assert.match(context.banner(true,'',assets,2),/banner.png/);
 assert.match(context.banner(true,'',assets,2),/banner-tv-decor/);
 for(const editor of [false,true]){context.editorMode=editor;assert.equal(context.banner(true,'',assets,3),'');assert.equal(context.banner(true,'',[],3),'')}
 assert.doesNotMatch(fs.readFileSync(require.resolve('../public/auction-control.html'),'utf8'),/page3-banner-section|3P 배너/);
});
test('P2 vendor toggle removes bracketed identity and logo in both layouts',()=>{
 let inline=false;
 const context=vm.createContext({activeItem:(_,items)=>items[0],CreoBroadcastProfiles:{resolve:()=>({settings:{page2InfoLayout:inline?'inline-traits':'standard'}})},vendorLogo:()=>'/vendor.png',esc:String,money:String,pageTwoProgress:()=>'',pageTwoInlineInfo:(item,tag)=>tag+item.name,pageTwoBidders:()=>'',banner:()=>'',showBanner:()=>false,pageTicker:()=>''});
 context.editorMode=false;context.CreoBroadcastSummary=require('../public/broadcast-summary');
 context.CreoBroadcastStandby=require('../public/broadcast-standby');context.channelId='alpha';
 loadFunction(context,'pageTwoParents');loadFunction(context,'pageTwo');
 const item={id:'live',status:'live',name:'개체',vendorName:'비송',lotNumber:1};
 for(inline of [false,true]){
  assert.match(context.pageTwo({}, {mode:'live',activeItemId:'live',page2VendorTagOn:true},[item],[]),/\[비송\]/);
  assert.doesNotMatch(context.pageTwo({}, {mode:'live',activeItemId:'live',page2VendorTagOn:false},[item],[]),/비송|vendor.png|vendor-tag/);
 }
});
