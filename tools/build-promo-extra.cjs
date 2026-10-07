'use strict';
// Source artwork uses verified participant assets, never AI-recreated vendor logos.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'public/promo-assets');
const out='C:/Users/5600x/Desktop/전크자/output/promo-center/추가원고2종';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,align:'center',color:'ink',...extra});
const h=text=>p(text,{size:24,bold:true}),sub=text=>p(text,{size:18,bold:true}),gap=()=>p('');
const image=(file,alt)=>({type:'image',src:'/promo-assets/'+file,alt,width:500});
const link=()=>p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',href:'https://band.us/n/a6a6beMe97Ucc'});
const common=[sub('10월 14일 수요일 밤 8시'),p('첫 방송은 서울·인천과 함께합니다'),gap(),sub('첫 방송 배송비 지원'),p('※ 낙찰자 1인당 최대 3만 원'),gap()];
async function main(){
 fs.mkdirSync(path.join(assets,'partner-logos'),{recursive:true});fs.mkdirSync(path.join(out,'이미지'),{recursive:true});
 const source=path.join(__dirname,'promo-partners.json');
 if(!fs.existsSync(source))fs.copyFileSync(path.join(out,'업체로고_출처.json'),source);
 const vendors=JSON.parse(fs.readFileSync(source,'utf8')),logos=vendors.filter(v=>v.url||v.file),missing=vendors.filter(v=>!v.url&&!v.file);
 fs.copyFileSync(source,path.join(out,'업체로고_출처.json'));
 await require('./render-partner-board.cjs').renderPartnerBoard(logos,assets);
 const pack=[
  {id:'launch26-showtime',name:'전국노래자랑 감성 · 우리 동네 크레 자랑',title:'🎤 전국의 집사님들, 이번엔 크레 자랑입니다',blocks:[
   h('전국의 집사님들\n크레 자랑하러 오세요'),gap(),
   p('동네마다 자랑거리가 하나씩 있듯\n크레를 키우는 집사님들께도\n꼭 보여주고 싶은 아이가 있죠.'),
   image('showtime-photo.png','얼굴이 보이지 않는 야외무대 진행자와 손 위의 작은 크레 · AI 연출 이미지'),p('※ AI 연출 이미지이며 실제 출연자·출품 개체가 아닙니다'),gap(),
   sub('이번에는 전국의 업체들이 자랑할 차례'),
   p('익숙한 전국노래자랑처럼, 지역을 바꿔 가며\n각자의 매력을 만나는 자리를 준비했습니다.\n마이크 앞에 꺼내 놓을 자랑은\n정성껏 키운 크레들입니다.'),gap(),
   sub('매주 월요일·수요일 밤 8시'),
   p('지역별 전문 업체가 돌아가며 참여하는\n네이버 밴드 크레스티드게코 라이브 경매.\n설명을 듣고 움직임도 보며\n마음에 드는 아이를 함께 찾아보세요.'),gap(),
   p('낙찰 시 카카오톡 알림톡이 자동 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 확인하고\n배송 정보는 한 번 등록하면 다음에도 그대로 사용합니다.\n수령은 집 근처 업체에서 픽업합니다.'),gap(),
   ...common,p('입양 계획이 없어도 구경은 환영입니다.\n우리 동네 크레 자랑, 함께 보실까요'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
  ]},
  {id:'launch26-partners',name:'참여업체 소개 · 실제 로고 모음',title:'🤝 익숙한 이름도, 새롭게 만날 이름도 한자리에',blocks:[
   h('반가운 업체들이\n한 밴드에 모였습니다'),gap(),
   p('평소 눈여겨보던 업체부터\n이번에 처음 알게 될 브리더까지.\n전국크레자랑에서 차례로 만나보세요.'),gap(),
   image('partners-20261007.png','전국크레자랑 참여업체 로고 모음 · 업체별 순차 출연'),
   p('※ 2026.10.07 기준 · 업체별 순차 출연'),gap(),
   sub('매회, 다른 업체의 다른 크레'),
   p('지역별 업체들이 돌아가며\n각자의 취향과 브리딩 방향이 담긴 크레를 선보입니다.\n여러 밴드의 방송 일정을 따로 찾는 대신\n한곳에서 다양한 아이들을 만나보세요.'),gap(),
   sub('매주 월요일·수요일 밤 8시'),p('네이버 밴드에서 진행하는 크레스티드게코 라이브 경매\n참여업체는 회차별로 나누어 출연합니다.'),gap(),
   sub('낙찰 뒤의 안내도 한곳에서'),
   p('카카오톡 알림톡이 자동으로 도착하면\n전용 페이지에서 낙찰 내역과 결제 안내를 확인하세요.\n배송 정보는 한 번 등록하면 다음에도 그대로 적용됩니다.\n수령은 집 근처 업체에서 픽업하는 방식입니다.'),gap(),
   ...common,p('어느 업체의 크레가 궁금하신가요\n첫 방송부터 편하게 구경하러 오세요.'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
  ]}
 ].map(t=>({...t,version:1,active:true}));
 const file=path.join(root,'promo-templates.json'),existing=JSON.parse(fs.readFileSync(file,'utf8')).filter(t=>!pack.some(p=>p.id===t.id));
 fs.writeFileSync(file,JSON.stringify([...existing,...pack],null,2)+'\n');
 const mf=path.join(root,'promo-media.json'),media=JSON.parse(fs.readFileSync(mf,'utf8'));for(const name of ['showtime-photo.png','partners-20261007.png'])media['/promo-assets/'+name]='https://creok.onrender.com/promo-assets/'+name;
 fs.writeFileSync(mf,JSON.stringify(media,null,2)+'\n');
 // Small real thumbnails keep the library fast even when the source art is large.
 for(const src of Object.keys(media)){
  const original=path.join(root,'public',src),thumb=original.replace(/\.[^.]+$/,'.thumb.webp');
  if(fs.existsSync(original)&&!src.endsWith('/partners-20261007.png'))await sharp(original).resize(800,450,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(thumb);
 }
 for(const t of pack){
  const name=t.id==='launch26-showtime'?'01_전국노래자랑감성':'02_참여업체로고';
  const body=t.blocks.map(b=>b.type==='image'?`<p style="text-align:center;margin:24px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p style="margin:0;text-align:${b.align};font-size:${b.size}px;font-weight:${b.bold?700:400};line-height:1.7;color:${b.color==='green'?'#007443':'#202632'}">${b.href?'<a href="'+esc(b.href)+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`).join('');
  fs.writeFileSync(path.join(out,name+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{max-width:500px;padding:24px 16px;margin:auto;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif;color:#202632}h1{font-size:20px;line-height:1.5;margin-bottom:40px}a{color:#007443}p{overflow-wrap:anywhere}</style><h1>${esc(t.title)}</h1><article>${body}</article></html>`);
  fs.writeFileSync(path.join(out,name+'.txt'),t.title+'\n\n'+t.blocks.map(b=>b.type==='image'?'[이미지: '+b.alt+']':b.text+(b.href?'\n'+b.href:'')).join('\n'));
  for(const b of t.blocks.filter(b=>b.type==='image'))if(fs.existsSync(path.join(root,'public',b.src)))fs.copyFileSync(path.join(root,'public',b.src),path.join(out,'이미지',path.basename(b.src)));
 }
 fs.writeFileSync(path.join(out,'추가원고2종.json'),JSON.stringify(pack,null,2));
 console.log(JSON.stringify({templates:pack.map(t=>({id:t.id,characters:t.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length})),brands:vendors.length,logos:logos.length,noLogo:missing.map(v=>v.name)}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
