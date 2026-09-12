'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const options={N:16384,r:8,p:1,maxmem:64*1024*1024};

async function hashPassword(password){
 if(typeof password!=='string'||password.length<1||password.length>128)throw Error('Use an operator password of 1–128 characters');
 const salt=crypto.randomBytes(16),key=await scrypt(password,salt,32,options);
 return ['scrypt-v1',salt.toString('base64url'),key.toString('base64url')].join(':');
}
function createOperatorPassword(encoded=''){
 const value=String(encoded||'').trim();
 if(!value)return {configured:false,sessionSecret:secret=>secret,verify:(password,fallback)=>fallback(password)};
 const parts=value.split(':'),salt=Buffer.from(parts[1]||'','base64url'),expected=Buffer.from(parts[2]||'','base64url');
 if(parts.length!==3||parts[0]!=='scrypt-v1'||salt.length!==16||expected.length!==32||salt.toString('base64url')!==parts[1]||expected.toString('base64url')!==parts[2])throw Error('Invalid CREO_OPERATOR_PASSWORD_HASH');
 let active=0;
 return {
  configured:true,
  sessionSecret:secret=>crypto.createHmac('sha256',secret).update('creo-browser-admin\0'+value).digest('hex'),
  async verify(password){
   if(typeof password!=='string'||password.length>128||password.length<1)return false;
   if(active>=4)throw Object.assign(Error('로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.'),{status:429});
   active++;
   try{return crypto.timingSafeEqual(await scrypt(password,salt,32,options),expected)}finally{active--;}
  }
 };
}
module.exports={hashPassword,createOperatorPassword};
