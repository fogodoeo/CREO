'use strict';
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const secret=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../config.json'),'utf8')).platform_admin_password;
 async function api(method,route,body){const r=await fetch('https://creok.onrender.com/api/platform/'+route,{method,headers:{'X-Creo-Admin':secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error(route+': '+r.status+' '+(data.error||''));return data;}
 const catalog=await api('GET','channels?includeArchived=1'),channel=catalog.channels.find(c=>c.id==='national-cre');
 if(!channel)throw Error('national-cre channel is missing');
 const policy=await api('GET','channels/national-cre/entry-policy');
 const bookings=await api('GET','channels/national-cre/broadcast-bookings');
 if(process.argv.includes('--activate')){
  if(bookings.mode!=='regional-cycle-v1'&&bookings.sessions.some(s=>s.reservations.some(r=>r.status==='confirmed')))throw Error('Existing legacy bookings require review');
  await api('PUT','channels/national-cre/national-cycle-config',{mode:'regional-cycle-v1'});
  if(!policy.open)await api('PUT','channels/national-cre/entry-policy',{open:true,expectedRevision:policy.revision});
 }
 const latest=await api('GET','channels/national-cre/broadcast-bookings');
 console.log(JSON.stringify({channel:channel.id,status:channel.status,mode:latest.mode||'legacy',regions:latest.regions,entryPolicy:(await api('GET','channels/national-cre/entry-policy')).open,reservations:latest.sessions.reduce((n,s)=>n+s.reservations.length,0),vendors:latest.vendors.length,firstSession:latest.sessions[0]?.date}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
