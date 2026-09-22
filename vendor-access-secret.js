'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Separate from the operator password. Never mirror this key into platform data.
function vendorAccessSecret({repository,secret=process.env.CREO_VENDOR_SECRET||''}={}){
 if(secret)return String(secret).length>=32?String(secret):'';
 if(!repository?.durable||!repository.dbPath)return '';
 const file=path.join(path.dirname(repository.dbPath),'vendor-access.key');
 try{fs.writeFileSync(file,crypto.randomBytes(48).toString('base64url'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')return '';}
 try{const value=fs.readFileSync(file,'utf8').trim();return /^[\w-]{64}$/.test(value)?value:'';}catch{return '';}
}
module.exports={vendorAccessSecret};
