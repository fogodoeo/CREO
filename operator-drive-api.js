'use strict';
const {CHUNK,validId}=require('./operator-drive');
async function body(req,limit,json=false) {
    if(Number(req.headers['content-length'])>limit)throw Object.assign(Error('전송 크기 제한을 초과했습니다.'),{status:413});
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error('전송 크기 제한을 초과했습니다.'),{status:413});chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    if(!json)return bytes;
    try{const value=JSON.parse(bytes.toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}
    catch{throw Object.assign(Error('요청 형식이 올바르지 않습니다.'),{status:400});}
}
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function createDriveApi({drive,isAdmin,origin=process.env.PUBLIC_BASE_URL||'https://creok.onrender.com'}) {
    return async(req,res,url)=>{
        if(!url.pathname.startsWith('/api/operator-drive/'))return false;
        try{
            if(!await isAdmin(req)){json(res,401,{error:'관리자 로그인이 필요합니다.'});return true;}
            if(!['GET','HEAD'].includes(req.method)) {
                if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin)throw Object.assign(Error('운영 페이지에서 다시 요청해 주세요.'),{status:403});
                if(!['application/json','application/octet-stream'].includes(String(req.headers['content-type']||'').split(';')[0]))throw Object.assign(Error('지원하지 않는 요청 형식입니다.'),{status:415});
            }
            const parts=url.pathname.slice('/api/operator-drive/'.length).split('/');
            let result;
            if(req.method==='GET'&&parts.length===1&&parts[0]==='entries')result=await drive.list();
            else if(req.method==='POST'&&parts.length===1&&['folders','uploads'].includes(parts[0]))result=await drive.create(await body(req,4096,true),parts[0]==='folders'?'folder':'file');
            else if(parts[0]==='entries'&&validId(parts[1])) {
                const id=parts[1],action=parts[2];
                if(req.method==='GET'&&action==='content'&&parts.length===3){const location=await drive.content(id,url.searchParams.get('preview')==='1');res.writeHead(307,{Location:location,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});res.end();return true;}
                if(req.method==='PATCH'&&parts.length===2)result=await drive.edit(id,await body(req,4096,true));
                else if(req.method==='PUT'&&action==='parts'&&parts.length===4)result=await drive.part(id,Number(parts[3]),()=>body(req,CHUNK));
                else if(req.method==='POST'&&parts.length===3&&['complete','trash','restore','purge','cancel'].includes(action)){
                    await body(req,4096,true);
                    result=await (action==='cancel'?drive.purge(id,true):drive[action](id));
                }
            }
            if(result===undefined)json(res,404,{error:'요청한 파일함 경로를 찾을 수 없습니다.'});else json(res,200,result);
        }catch(e){json(res,e.status||503,{error:e.status?e.message:'파일함 작업을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'});}
        return true;
    };
}
module.exports={createDriveApi};
