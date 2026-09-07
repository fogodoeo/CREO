const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('banner keeps the old frame until the next video is ready and preserves placement',async()=>{
 const timers=new Map();let serial=0;
 const frame={dataset:{bannerPlaylist:JSON.stringify([{url:'a.mp4',video:true},{url:'b.mp4',video:true}]),layoutCustom:'1'},style:{left:'20%'},children:[],isConnected:true,append(m){this.children.push(m)},matches:()=>true,querySelectorAll:()=>[]};
 const context={document:{createElement:tag=>({tagName:tag.toUpperCase(),style:{},play:()=>Promise.resolve(),pause(){},load(){},removeAttribute(){},remove(){frame.children=frame.children.filter(m=>m!==this)},requestVideoFrameCallback(fn){this.readyFrame=fn}})},setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn()};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../public/banner-player.js'),'utf8'),context);
 const api=context.CreoBannerPlayer;api.hydrate({querySelectorAll:()=>[frame]});
 const first=frame.children[0];first.onloadeddata();first.readyFrame();await Promise.resolve();first.readyFrame();
 assert.equal(first.style.opacity,'1');assert.equal(frame.children.length,2);
 const second=frame.children[1];[...timers.values()].find(t=>t.ms===6000).fn();
 assert.equal(first.style.opacity,'1');assert.equal(second.style.opacity,'0');
 second.onloadeddata();second.readyFrame();await Promise.resolve();second.readyFrame();
 assert.equal(second.style.opacity,'1');assert.ok(!frame.children.includes(first));assert.equal(frame.style.left,'20%');assert.equal(frame.dataset.layoutCustom,'1');
 api.hydrate({querySelectorAll:()=>[frame]});assert.equal(frame.children.length,2);
 const failed=frame.children.find(m=>m!==second);failed.onerror();
 assert.equal(second.style.opacity,'1');assert.equal(frame.children.length,1);
 [...timers.values()].find(t=>t.ms===1500).fn();assert.equal(frame.children.length,2);
 api.release(frame);assert.equal(frame.children.length,0);
});
