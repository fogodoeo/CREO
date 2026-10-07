'use strict';
// Four editorial directions. The accepted Joseon manuscript is preserved verbatim.
// Run after the generated photographs have been copied to promo-assets.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'public/promo-assets');
const out='C:/Users/5600x/Desktop/전크자/output/promo-center/원고_리뉴얼_20261008';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,color:'ink',align:'left',...extra});
const h=text=>p(text,{size:26,bold:true,align:'center'});
const sub=text=>p(text,{size:20,bold:true});
const gap=()=>p('');
const image=(file,alt)=>({type:'image',src:'/promo-assets/'+file,alt,width:500});
const link=()=>p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',align:'center',href:'https://band.us/n/a6a6beMe97Ucc'});
const footer=[gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색',{align:'center'})];
const pack=[
 {id:'launch26-showtime',name:'전국노래자랑형 · 우리 동네 자랑',title:'🎤 전국~~~~크레자랑｜이번엔 서울·인천이 자랑할 차례',catalogOrder:2,blocks:[
  h('전국~~~~크레자랑'),gap(),p('마이크 테스트, 하나 둘\n전국의 크레 집사님들, 잘 들리시나요',{align:'center'}),
  image('festival-stage-v5.jpg','마이크를 든 진행자가 맞이하는 야외무대 · AI 연출'),
  sub('“우리 동네에 이런 크레가 있습니다”'),
  p('노래 대신 크레를 자랑하는 시간\n전국의 전문 브리더·업체 30여 곳이 함께합니다\n지역을 바꿔 가며, 정성껏 키운 아이들을 선보입니다'),gap(),
  p('서로 다른 무늬와 색, 서로 다른 브리딩 이야기\n한 업체만 보던 구경이 전국으로 넓어집니다'),
  image('festival-cre-v5.jpg','서로 다른 무늬의 작은 크레를 소개하는 장갑 낀 손 · AI 연출'),
  sub('구경은 신나게, 마음에 들면 경매로'),
  p('매주 월요일·수요일 밤 8시\n네이버 밴드에서 라이브로 만나요\n움직임을 보고 설명을 들으며 입찰할 수 있습니다'),gap(),
  sub('낙찰 뒤에는 카카오톡으로'),
  p('알림톡이 자동으로 도착하면\n링크의 전용 페이지에서 낙찰 내역과 결제 안내를 확인하세요\n배송 정보는 한 번 등록하면 다음에도 그대로 적용됩니다\n수령은 집 근처 업체에서 픽업하는 방식입니다'),gap(),
  h('첫 자랑은 서울·인천'),
  p('10월 14일 수요일 밤 8시\n꼭 입양할 계획이 없어도, 구경하러 오세요',{align:'center'}),
  p('※ 위 무대·크레 사진은 AI 연출이며 실제 출연자·출품 개체가 아닙니다'),...footer
 ]},
 {id:'ep01-welcome',name:'입찰자 인터뷰형 · 구경보다 바빴던 날',title:'💬 “크레는 보고 싶은데, 방송 찾는 게 일이더라고요”',catalogOrder:3,blocks:[
  h('“구경하려고 켰는데\n제가 더 바쁘더라고요”'),gap(),
  p('라이브 경매를 챙겨 보는 집사와 나눠 본 이야기\n※ 자주 겪는 불편을 바탕으로 구성한 가상 인터뷰입니다'),
  image('interview-home-v5.jpg','휴대폰을 든 집사와 마이크 · 얼굴이 보이지 않는 AI 연출 사진'),
  sub('Q. 뭐가 번거로웠나요'),
  p('“좋아하는 업체는 여러 곳인데 방송 시간이 다 달라요\n이 밴드 저 밴드 찾다 보면, 보고 싶던 방송을 놓치기도 하고요”'),gap(),
  sub('Q. 낙찰받은 다음은요'),
  p('“결제 안내는 어디 있었지, 배송 정보는 누구한테 보내지\n다음에 또 낙찰받으면 같은 내용을 다시 적고요”'),gap(),
  h('그래서, 한곳에 모았습니다'),gap(),
  p('전국크레자랑에는 30여 곳의 전문 브리더·업체가 함께합니다\n여러 지역의 전문 업체가 돌아가며 참여하는\n매주 월요일·수요일 밤 8시 라이브 경매입니다'),gap(),
  sub('방송은 정해진 시간에\n낙찰 안내는 전용 페이지에서'),
  p('낙찰 시 카카오톡 채널 알림톡이 자동으로 발송됩니다\n톡 안의 링크에서 낙찰 내역과 결제 안내를 확인하고\n등록한 배송 정보는 다음 낙찰에도 다시 사용합니다'),
  image('after-bid-v5.png','카카오톡 알림톡 → 전용 페이지 확인 → 집 근처 업체 픽업'),
  sub('Q. 첫 방송은 언제인가요'),
  p('10월 14일 수요일 밤 8시, 서울·인천 편입니다\n집 근처 업체에서 픽업하는 방식으로 수령하며\n첫 방송은 낙찰자 1인당 배송비 최대 3만 원을 지원합니다'),gap(),
  p('찾아다니는 시간은 줄이고\n좋아하는 크레를 보는 시간은 늘려 보세요'),...footer
 ]},
 {id:'ep01-brief',name:'담백한 안내형 · 필요한 정보만',title:'🟢 전국의 크레를 한 밴드에서｜월·수 밤 8시',catalogOrder:4,blocks:[
  h('전국의 크레를\n한 밴드에서'),gap(),
  p('30여 곳의 전문 브리더·업체가 함께하는\n크레스티드게코 라이브 경매',{align:'center'}),
  image('flat-schedule-v5.png','매주 월요일·수요일 밤 8시 · 첫 방송 10월 14일 서울·인천'),
  sub('매회, 다른 지역과 다른 업체'),
  p('서울·인천 / 경기 / 대구·경북\n부산·울산·경남 / 전라·충청\n지역별 업체들이 돌아가며 다양한 크레를 선보입니다'),gap(),
  sub('낙찰 안내는 자동으로'),
  p('카카오톡 채널 알림톡이 자동 발송됩니다\n링크의 전용 페이지에서 낙찰 내역과 결제 안내를 확인합니다'),gap(),
  sub('배송 정보는 한 번만'),
  p('등록한 배송 정보는 다음 낙찰에도 그대로 적용됩니다\n수령은 집 근처 업체에서 픽업합니다'),gap(),
  sub('첫 방송, 서울·인천'),
  p('10월 14일 수요일 밤 8시\n첫 방송 낙찰자 1인당 배송비 최대 3만 원 지원'),gap(),
  p('입양 계획이 없어도 편하게 구경하러 오세요'),...footer
 ]},
 {id:'launch26-collector',name:'파사모 인사형 · 집사님들께 드리는 초대',title:'🦎 집사님들, 월·수 밤 8시에 같이 크레 구경하실래요',catalogOrder:5,blocks:[
  p('안녕하세요 집사님들, [업체명]입니다\n날씨가 부쩍 쌀쌀해졌네요\n집사님들도 아가들도 따뜻하게 지내고 계신가요'),gap(),
  p('저도 예쁜 아이들 보려고 이 밴드 저 밴드 찾아다니다가\n한곳에서 여러 업체의 크레를 볼 수 있으면 좋겠다는 생각을 했는데요'),gap(),
  p('그 마음에 공감한 30여 곳의 전문 브리더·업체분들과\n‘전국크레자랑’이라는 밴드 라이브를 함께 시작하게 되었습니다'),gap(),
  sub('매주 월요일·수요일 밤 8시'),
  p('지역별 업체들이 돌아가며 정성껏 키운 아이들을 선보일 예정이에요\n익숙한 업체의 크레도, 처음 만나는 업체의 크레도\n한 밴드에서 함께 구경하실 수 있습니다'),
  image('cafe-invite-v5.png','10월 14일 수요일 밤 8시 · 서울·인천부터 함께 만나요'),
  sub('낙찰 뒤의 안내도 조금 더 편하게'),
  p('낙찰받으시면 카카오톡 채널 알림톡이 자동으로 도착해요\n톡 안의 링크에서 낙찰 내역과 결제 안내를 확인하실 수 있고\n배송 정보는 처음 한 번 등록해 두시면 다음에도 그대로 적용됩니다\n아이들은 집 근처 업체에서 픽업하는 방식으로 만나게 됩니다'),gap(),
  sub('10월 14일, 서울·인천부터 인사드릴게요'),
  p('첫 방송은 수요일 밤 8시에 시작합니다\n첫 발걸음을 함께해 주시는 낙찰자분들께는\n1인당 배송비 최대 3만 원을 지원해 드려요'),gap(),
  p('꼭 입양이 아니더라도 예쁜 아이들 구경하러 편하게 오세요\n첫 방송에서 반갑게 인사드리겠습니다\n오늘도 크레들과 좋은 하루 보내세요'),...footer
 ]}
].map(t=>({...t,version:1,bundleVersion:5,active:true}));

async function artwork(file,svg){
 await sharp(Buffer.from(svg)).png().toFile(path.join(assets,file));
}
async function main(){
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'이미지'),{recursive:true});
 const fontfile=path.join(assets,'PretendardVariable.ttf');
 const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
 const txt=async(x,y,s,text,color='#202632',weight=650)=>{
  const {data,info}=await sharp({text:{text:`<span foreground="${color}" weight="${weight}">${esc(text)}</span>`,font:`Pretendard Variable ${s}`,fontfile,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
  return `<image x="${x}" y="${y-info.height}" width="${info.width}" height="${info.height}" href="data:image/png;base64,${data.toString('base64')}"/>`;
 };
 await artwork('flat-schedule-v5.png',svg(1500,570,`<rect width="1500" height="570" fill="#f4f6f5"/>${await txt(96,104,36,'전국크레자랑 · 정기 라이브','#007443')}<line x1="96" y1="148" x2="1404" y2="148" stroke="#d6ded9" stroke-width="2"/>${await txt(96,302,110,'월요일  수요일')}${await txt(96,410,76,'밤 8시')}<circle cx="1286" cy="302" r="85" fill="#007443"/>${await txt(1228,329,82,'8','#fff')}<line x1="96" y1="452" x2="1404" y2="452" stroke="#d6ded9" stroke-width="2"/>${await txt(96,518,38,'첫 방송 10.14 수요일 · 서울·인천', '#626d7b',500)}`));
 const kakao=fs.readFileSync(path.join(assets,'kakaotalk-symbol.png')).toString('base64');
 await artwork('after-bid-v5.png',svg(1200,440,`<rect width="1200" height="440" fill="#f5f6f8"/>${await txt(60,96,36,'낙찰 후에도, 한 흐름으로','#626d7b',500)}<image x="60" y="174" width="88" height="88" href="data:image/png;base64,${kakao}"/>${await txt(166,250,64,'알림톡')}<path d="M362 224h42m-14-14 14 14-14 14" fill="none" stroke="#626d7b" stroke-width="4"/>${await txt(446,211,64,'전용')}${await txt(446,287,64,'페이지')}<path d="M738 224h42m-14-14 14 14-14 14" fill="none" stroke="#626d7b" stroke-width="4"/>${await txt(848,211,64,'업체')}${await txt(848,287,64,'픽업')}${await txt(60,382,36,'배송 정보는 한 번 등록하면 다음에도 그대로','#626d7b',500)}`));
 await artwork('cafe-invite-v5.png',svg(1500,540,`<rect width="1500" height="540" fill="#f2f6f3"/>${await txt(96,111,38,'전국크레자랑 · 첫 만남','#007443')}<line x1="96" y1="150" x2="1404" y2="150" stroke="#cad8ce" stroke-width="2"/>${await txt(96,310,110,'10.14 수요일')}${await txt(96,420,72,'서울·인천에서 만나요')}<circle cx="1268" cy="296" r="91" fill="#fff" stroke="#007443" stroke-width="3"/>${await txt(1206,284,40,'밤 8시','#007443')}${await txt(1210,341,37,'LIVE','#007443')}`));
 const old=JSON.parse(fs.readFileSync(path.join(root,'promo-templates.json'),'utf8'));
 const joseon=old.find(t=>t.id==='launch26-joseon');if(!joseon)throw Error('Accepted manuscript missing');
 const templates=[{...joseon,catalogOrder:1},...pack];
 const media=JSON.parse(fs.readFileSync(path.join(root,'promo-media.json'),'utf8'));
 for(const t of pack)for(const b of t.blocks.filter(b=>b.type==='image')){
  const src=path.join(root,'public',b.src);if(!fs.existsSync(src))throw Error('Missing '+src);
  media[b.src]='https://creok.onrender.com'+b.src;
  await sharp(src).resize(800,450,{fit:'inside',withoutEnlargement:true}).webp({quality:86}).toFile(src.replace(/\.[^.]+$/,'.thumb.webp'));
 }
 fs.writeFileSync(path.join(root,'promo-templates.json'),JSON.stringify(templates,null,2)+'\n');
 fs.writeFileSync(path.join(root,'promo-media.json'),JSON.stringify(media,null,2)+'\n');
 for(const [i,t]of templates.entries()){
  const blocks=t.blocks.filter(b=>b.src!=='/promo-assets/hero.jpg'&&b.src!=='/promo-assets/ticket.png');
  blocks.unshift(image('hero-seoul-incheon-v3.png','전국크레자랑 · EP 01. 서울·인천'));
  const idx=blocks.findIndex(b=>b.href);blocks.splice(idx<0?blocks.length:idx,0,image('ticket-seoul-incheon-v2.png','첫 방송 서울·인천 편 배송비 무료 · 낙찰자 1인당 최대 3만 원 지원'));
  const body=blocks.map(b=>b.type==='image'?`<p style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p style="text-align:${b.align};font-size:${b.size}px;font-weight:${b.bold?700:400};line-height:1.7;margin:0;color:${b.color==='green'?'#007443':'#202632'}">${b.href?'<a href="'+b.href+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`).join('');
  const name=String(i+1).padStart(2,'0')+'_'+t.name.split(' · ')[0];
  fs.writeFileSync(path.join(out,name+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{max-width:532px;padding:24px 16px;margin:auto;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif;color:#202632}h1{font-size:20px;line-height:1.5;margin-bottom:40px}a{color:#007443}p{overflow-wrap:anywhere}</style><h1>${esc(t.title)}</h1><article>${body}</article></html>`);
  fs.writeFileSync(path.join(out,name+'.txt'),t.title+'\n\n'+blocks.map(b=>b.type==='image'?'[이미지: '+b.alt+']':b.text+(b.href?'\n'+b.href:'')).join('\n'));
  for(const b of blocks.filter(b=>b.type==='image'))fs.copyFileSync(path.join(root,'public',b.src),path.join(out,'이미지',path.basename(b.src)));
 }
 fs.writeFileSync(path.join(out,'원고5종.json'),JSON.stringify(templates,null,2)+'\n');
 console.log(JSON.stringify(templates.map(t=>({id:t.id,name:t.name,characters:t.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length,images:t.blocks.filter(b=>b.type==='image').length}))));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
