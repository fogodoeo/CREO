'use strict';
// Synthetic, localhost-only scenes. Never reads or writes production auctions.
const origin='http://127.0.0.1:4361',headers={'X-Creo-Admin':'isolated-vendor-portal-test-secret-0001','Content-Type':'application/json'};
async function call(method,path,body){const r=await fetch(origin+'/api/platform/channels/national-cre/'+path,{method,headers,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;}
async function main(){
 const scene=process.argv[2]||'normal',long=scene==='long',scale=long?2.5:1.5;
 if(!['normal','long','empty','one','sold','standby'].includes(scene))throw Error('Unknown isolated scene');
 const workspace=await call('GET','workspace'),row=workspace.items.find(r=>r.id==='show');
 const bids=scene==='empty'?[]:[{name:long?'가상 크레스티드게코 연구소 긴 입찰자명':'게코친구',amount:long?12345:23},...(scene==='one'?[]:[{name:'크레집사',amount:long?13000:25}])];
 await call('PUT','items/show',{record:{...row,name:long?'A06 가상 릴리화이트 크레스티드게코 긴 개체 이름':'A06',note:long?'아주 긴 가상 개체 설명과 부모 계보 안내가 여러 번 이어져도 자막 폭은 화면을 넘지 않습니다. '.repeat(4):'SPT',status:scene==='sold'?'sold':'live',soldPrice:scene==='sold'?250000:0,attributes:{...row.attributes,bid_log:JSON.stringify(bids)}}});
 const layout=structuredClone(workspace.broadcast.layoutPlacements);
 layout['p2-info']={x:26.5,y:5,width:71.7,height:12.7,fontScale:scale,opacity:100,visible:true,autoWidth:true};
 layout['p2-bidders']={x:4,y:54,width:28,height:18,fontScale:scale,opacity:100,visible:true,autoWidth:true};
 await call('PUT','broadcast-state',{layoutPlacements:layout,activeItemId:scene==='standby'?'':'show',mode:scene==='standby'?'standby':scene==='sold'?'sold':'live'});
 console.log(JSON.stringify({scene,scale,preview:origin+'/auction-live.html?channel=national-cre&page=2'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
