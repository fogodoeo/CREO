'use strict';
const crypto=require('node:crypto');
const channelKey=id=>`creo_organizer_access::${id}`;
const lookupKey=code=>'creo_organizer_access_lookup::'+crypto.createHash('sha256').update(code).digest('hex');
function createOrganizerAccess(repository){
 async function read(key){const rows=await repository.getRowsByKeys([key]);return JSON.parse(rows.find(r=>r.key===key)?.value||'null')}
 async function current(channelId){const entry=await read(channelKey(channelId));return entry&&entry.expiresAt>Date.now()?entry:null}
 async function issue(channelId){
  const existing=await current(channelId);if(existing)return existing;
  const entry={code:crypto.randomBytes(18).toString('base64url'),channelId,expiresAt:Date.now()+365*24*60*60*1000};
  await repository.upsertRows([{key:channelKey(channelId),value:JSON.stringify(entry)},{key:lookupKey(entry.code),value:JSON.stringify({channelId,expiresAt:entry.expiresAt})}]);return entry;
 }
 async function resolve(code){
  if(typeof code!=='string'||! /^[A-Za-z0-9_-]{24}$/.test(code))return null;
  const lookup=await read(lookupKey(code));if(!lookup||lookup.expiresAt<=Date.now())return null;
  const entry=await current(lookup.channelId);return entry&&entry.code===code?entry:null;
 }
 return {current,issue,resolve};
}
module.exports={createOrganizerAccess};
