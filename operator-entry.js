'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function entryPath(pathname){
 try{return decodeURIComponent(pathname).replace(/\\/g,'/').replace(/\/+/g,'/').toLowerCase()}catch{return '';}
}
function isProtectedEntry(pathname){return ['/main','/main/','/index.html'].includes(entryPath(pathname));}
function createOperatorEntry({isAuthenticated,publicDir=path.join(__dirname,'public'),frontendOrigin=''}={}){
 if(typeof isAuthenticated!=='function')throw Error('Operator authentication is required');
 const frontend=frontendOrigin?new URL(frontendOrigin):null;
 if(frontend&&(!['http:','https:'].includes(frontend.protocol)||frontend.username||frontend.password||frontend.pathname!=='/'||frontend.search||frontend.hash))throw Error('Invalid frontend origin');
 return async(req,res,url)=>{
  const pathname=entryPath(url.pathname);
  if(pathname!=='/'&&!isProtectedEntry(url.pathname))return false;
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','X-Robots-Tag':'noindex, nofollow','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end();return true;}
  if(pathname==='/'&&frontend&&frontend.host!==req.headers.host){const destination=new URL(frontend);destination.search=url.search;res.writeHead(307,{...headers,Location:destination.href});res.end();return true;}
  if(pathname==='/index.html'||pathname==='/main/'||pathname==='/main'&&url.pathname!=='/main'){
   res.writeHead(302,{...headers,Location:'/main'+url.search});res.end();return true;
  }
  const file=pathname==='/'?'welcome.html':await isAuthenticated(req)?'index.html':'operator-login.html';
  const content=await fs.readFile(path.join(publicDir,file));
  res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Length':content.length});res.end(req.method==='HEAD'?undefined:content);return true;
 };
}
module.exports={createOperatorEntry,isProtectedEntry,entryPath};
