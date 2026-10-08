'use strict';
// Add distinct manuscripts without replacing any existing seed or operator content.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const output='C:/Users/5600x/Desktop/전크자/output/promo-center/새콘셉트원고3종_20261008';
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,color:'ink',align:'center',...extra});
const h=text=>p(text,{size:26,bold:true});
const sub=text=>p(text,{size:20,bold:true});
const gap=()=>p('');
const image=(file,alt)=>({type:'image',src:'/promo-assets/'+file,alt,width:500});
const footer=[gap(),p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',href:'https://band.us/n/a6a6beMe97Ucc'}),p('네이버 밴드에서 ‘전국크레자랑’ 검색')];
const followup='낙찰되면 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n톡 안의 전용 페이지에서 낙찰 내역과 결제 안내를 확인해 주세요.\n처음 등록한 배송 정보는 다음 낙찰에도 그대로 적용됩니다.\n\n생물 전문 배송업체가 집 근처 제휴 업체까지 배송하며,\n도착 후 상태를 직접 확인하고 픽업하시면 됩니다.';
const pack=[
 {id:'launch26-series',name:'드라마 첫 화형 · 다음 지역이 기다려지는 방송',title:'🎬 첫 화부터 같이 보실래요｜서울·인천 편 10.14',catalogOrder:7,blocks:[
  h('이번 시리즈의 주인공은\n크레입니다'),gap(),
  p('안녕하세요 파사모 회원님들\n[업체명]입니다\n새로운 방송을 소개하려니 저희도 첫 화를 기다리는 기분이네요.\n이번엔 전국의 샵들이 한 밴드에 모여,\n회차마다 다른 지역의 크레들을 소개합니다.'),
  image('series-premiere-v1.jpg','라이브 촬영 카메라 앞에서 작은 크레를 소개하는 두 진행자의 손'),
  sub('같은 시간, 같은 밴드\n출연하는 지역은 달라집니다'),
  p('서울·인천, 경기, 경북, 경남, 전라·충청.\n30여 곳의 전문 브리더·업체가 돌아가며 참여합니다.\n\n한 샵에서 끝나는 구경이 아니라\n“다음엔 어느 지역 아이들이 나올까” 기다리는 재미.\n매주 월요일과 수요일 밤 8시에 이어집니다.'),gap(),
  sub('마음에 드는 주인공을 만났다면'),p(followup),gap(),
  h('EP 01 서울·인천\n10월 14일 수요일 밤 8시'),
  p('첫 방송 낙찰자분들께 배송비를 1인당 최대 3만 원 지원합니다.\n\n꼭 입양이 아니어도 괜찮습니다.\n첫 화부터 편하게 함께 봐주세요.\n전국크레자랑 밴드에서 인사드리겠습니다 ^^'),...footer
 ]},
 {id:'launch26-questions',name:'라이브 질문형 · 사진 다음의 궁금증',title:'🔎 사진 저장만 하던 그 크레｜라이브에서 물어보세요',catalogOrder:8,blocks:[
  h('예쁜 건 알겠는데\n궁금한 게 더 많아졌다면'),gap(),
  p('안녕하세요 집사님들\n[업체명]입니다\n크레 사진을 보다 보면 저장 버튼부터 누르게 되죠.\n그런데 막상 더 알아보고 싶을 땐\n사진 한 장으로는 답이 안 나오는 질문들도 생깁니다.'),
  image('live-question-v1.jpg','작은 크레의 옆구리 무늬를 손으로 가리키며 설명하는 브리더'),
  sub('어떤 라인에서 태어났나요\n자라면서 무늬는 어떻게 달라졌나요'),
  p('아이의 움직임을 보며 브리더의 설명을 듣고,\n궁금한 점은 라이브 채팅으로 물어봐 주세요.\n처음 크레를 알아보는 분도,\n오래 키워온 집사님도 편하게 함께하실 수 있습니다.'),gap(),
  sub('답해주는 샵도, 소개하는 아이들도\n회차마다 새롭게'),
  p('전국의 전문 브리더·업체 30여 곳이 함께합니다.\n다른 지역의 샵들이 돌아가며 참여하는\n네이버 밴드 라이브 경매 ‘전국크레자랑’.\n\n매주 월요일과 수요일 밤 8시,\n사진 속 궁금증을 방송에서 이어가 보세요.'),gap(),
  sub('낙찰 뒤 안내는 알림톡으로'),p(followup),gap(),
  h('첫 질문은 서울·인천부터\n10월 14일 수요일 밤 8시'),
  p('첫 방송 낙찰자 1인당 배송비 최대 3만 원 지원.\n\n입양을 정하지 않으셔도 편하게 구경하러 오세요.\n회원님들은 크레를 볼 때 어떤 점이 가장 궁금하신가요?\n방송에서 반갑게 만나겠습니다 ^^'),...footer
 ]},
 {id:'launch26-afterwork',name:'퇴근 후 취미형 · 월·수 밤의 작은 즐거움',title:'📺 퇴근하고 뭐 보세요｜월·수엔 크레 구경',catalogOrder:9,blocks:[
  h('오늘 하루는 여기까지\n이제 크레 구경할 시간'),gap(),
  p('안녕하세요 파사모 회원님들\n[업체명]입니다\n할 일 마치고 잠깐 앉아서 예쁜 아이들 보는 시간.\n크레 좋아하는 분들께는 이런 소소한 구경도\n하루 끝의 작은 즐거움이 아닐까 싶습니다.'),
  image('afterwork-viewing-v1.jpg','저녁 조명 아래 휴대폰과 작은 크레 사육장 곁에서 쉬는 집사의 손'),
  sub('월요일도, 수요일도\n밤 8시에 한 밴드에서'),
  p('전국의 전문 브리더·업체 30여 곳이 모였습니다.\n지역별 샵들이 돌아가며 각자의 크레들을 소개하니,\n한 밴드 안에서도 매회 다른 아이들을 구경할 수 있어요.\n\n오늘은 어떤 무늬가 눈에 들어올지,\n어떤 샵의 브리딩 이야기가 들릴지.\n네이버 밴드 라이브 경매 ‘전국크레자랑’에서 함께 보세요.'),gap(),
  sub('구경하다 마음에 드는 아이를 만났을 땐'),p(followup),gap(),
  h('10월 14일 수요일 밤 8시\n서울·인천부터 시작합니다'),
  p('첫 방송에는 낙찰자 1인당 배송비 최대 3만 원을 지원합니다.\n\n입양 계획이 없어도 부담 없이 들러주세요.\n크레 구경하며 잠깐 쉬어가는 저녁이면 좋겠습니다.\n첫 방송에서 인사드릴게요 ^^'),...footer
 ]}
].map(t=>({...t,version:1,bundleVersion:1,active:true}));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function main(){
 const seedPath=path.join(root,'promo-templates.json'),mediaPath=path.join(root,'promo-media.json');
 const before=JSON.parse(fs.readFileSync(seedPath,'utf8'));
 const merged=[...before,...pack.filter(t=>!before.some(old=>old.id===t.id))];
 const media=JSON.parse(fs.readFileSync(mediaPath,'utf8'));
 for(const t of pack)for(const b of t.blocks.filter(b=>b.type==='image')){
  if(!fs.existsSync(path.join(root,'public',b.src)))throw Error('Missing asset '+b.src);
  media[b.src]='https://creok.onrender.com'+b.src;
 }
 fs.mkdirSync(path.join(output,'이미지'),{recursive:true});
 for(const [i,definition]of pack.entries()){
  const t=merged.find(v=>v.id===definition.id);
  const blocks=[image('hero-seoul-incheon-v3.png','전국크레자랑 · EP 01 서울·인천'),...t.blocks];
  blocks.splice(blocks.findIndex(b=>b.href),0,image('ticket-seoul-incheon-v2.png','첫 방송 서울·인천 편 · 낙찰자당 배송비 최대 3만 원 지원'));
  const file=String(i+1).padStart(2,'0')+'_'+t.name.split(' · ')[0];
  const html=blocks.map(b=>b.type==='image'?`<p style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p align="center" style="text-align:center;font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;font-size:${b.size}px;font-weight:${b.bold?700:400};line-height:1.75;margin:0;word-break:keep-all;overflow-wrap:anywhere;color:${b.color==='green'?'#007443':'#202632'}">${b.href?'<a href="'+b.href+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`).join('');
  fs.writeFileSync(path.join(output,file+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{max-width:532px;padding:24px 16px;margin:auto;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif;color:#202632;text-align:center}h1{font-size:20px;line-height:1.5;margin-bottom:40px}a{color:#007443}</style><h1>${esc(t.title)}</h1><article>${html}</article></html>`,'utf8');
  fs.writeFileSync(path.join(output,file+'.txt'),t.title+'\n\n'+blocks.map(b=>b.type==='image'?'[이미지: '+b.alt+']':b.text+(b.href?'\n'+b.href:'')).join('\n'),'utf8');
  for(const b of blocks.filter(b=>b.type==='image'))fs.copyFileSync(path.join(root,'public',b.src),path.join(output,'이미지',path.basename(b.src)));
 }
 fs.writeFileSync(seedPath,JSON.stringify(merged,null,2)+'\n','utf8');
 fs.writeFileSync(mediaPath,JSON.stringify(media,null,2)+'\n','utf8');
 fs.writeFileSync(path.join(output,'새콘셉트원고3종.json'),JSON.stringify(pack,null,2)+'\n','utf8');
 console.log(JSON.stringify(pack.map(t=>({id:t.id,title:t.title,characters:t.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length}))));
}
if(require.main===module)main();
module.exports={pack};
