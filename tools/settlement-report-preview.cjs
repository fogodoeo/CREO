'use strict';
// Local synthetic records only. The real APIs and export code run unchanged.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {fixture,item}=require('./national-settlement-fixture.cjs');
async function main(){
    const f=await fixture(),root=path.resolve(__dirname,'../public'),origin='http://127.0.0.1:4363';
    await f.repository.upsertRecord('national-cre','item',item('a04','v1',{status:'passed',soldPrice:0,winnerPhone:''}));
    await f.repository.upsertRecord('national-cre','item',item('e05','v2',{attributes:{broadcastDate:'2026-10-14',auctionKind:'event'}}));
    await f.request('POST','/buyer-shipping',f.saveBody,false);
    await f.request('POST','/channels/national-cre/buyer-shipping-payment',{itemId:'a01',requestId:'preview-payment-0001'});
    await f.repository.upsertRecord('national-cre','item',item('b06','v2',{winnerPhone:'',winnerName:'가상 미확인',attributes:{broadcastDate:'2026-10-14'}}));
    await f.request('POST','/channels/national-cre/organizer-shipping/deposit',{vendorId:'v1',amount:20000,paidOn:'2026-10-14',memo:'가상 부분 입금',expectedReceivedAmount:0,expectedTotalAmount:50000,requestId:'preview-deposit-0001'});
    const server=http.createServer(async(req,res)=>{try{
        const u=new URL(req.url,origin);
        if(u.pathname==='/mobile'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<style>body{margin:0;background:#ccd3de}iframe{display:block;width:360px;height:840px;border:0;margin:auto}</style><iframe title="모바일 총정산" src="/settlement-report.html?channel=national-cre"></iframe>');return;}
        if(u.pathname.startsWith('/api/')&&await f.api.handle(req,res,u))return;
        const file=path.resolve(root,'.'+u.pathname);
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
        res.writeHead(200,{'Cache-Control':'no-store','Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
    }catch(e){console.error(e.message);res.writeHead(500);res.end('Isolated preview error');}});
    server.listen(4363,'127.0.0.1',()=>console.log(origin+'/settlement-report.html?channel=national-cre'));
    process.once('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
