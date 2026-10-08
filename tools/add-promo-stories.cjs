'use strict';
// Adds three community-voiced stories while preserving the user's approved manuscripts.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const {polishPromoBlocks,polishPromoTitle}=require('../promo-copy-polish');
const {addPromoImages}=require('../promo-image-additions');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'public/promo-assets');
const output='C:/Users/5600x/Desktop/전크자/output/promo-center/추가원고3종_20261008';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,color:'ink',align:'center',...extra});
const h=text=>p(text,{size:26,bold:true,align:'center'});
const sub=text=>p(text,{size:20,bold:true,align:'center'});
const gap=()=>p('');
const image=(file,alt)=>({type:'image',src:'/promo-assets/'+file,alt,width:500});
const footer=[gap(),p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',align:'center',href:'https://band.us/n/a6a6beMe97Ucc'}),p('네이버 밴드에서 ‘전국크레자랑’ 검색',{align:'center'})];
const pack=[
 {id:'launch26-taste',name:'취향 찾기형 · 어떤 크레에 눈이 가세요',title:'✨ 발색파세요, 화이트 월파세요? 취향 찾으러 오세요',catalogOrder:4,blocks:[
  h('같은 크레를 봐도\n눈이 가는 포인트는 제각각이죠!'),gap(),
  p('안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n크레 아이들 보실 때 어디에 가장 먼저 눈이 가시나요?\n묵직한 다크 발색, 하얗게 꽉 찬 화이트 월, 빈틈없는 핀과 드리피…\n집사님마다 “이건 진짜 못 참지” 하는 최애 포인트가 다 다르시더라고요.'),
  image('taste-v6.jpg','서로 다른 색과 무늬의 크레스티드게코 세 마리 · AI 연출 이미지'),
  sub('내 취향이 아닐 줄 알았는데, 자꾸만 보게 되는 아이'),
  p('저희도 아이들 축양하다 보면 참 신기할 때가 많습니다.\n비슷한 모프여도 콧대 라인 하나, 옆구리 패턴 하나에 느낌이 완전히 달라지거든요.\n\n평소 좋아하시던 고정 취향도 좋지만,\n생각지도 못했던 매력의 아이에게 문득 눈길이 꽂히는 재미도 크레를 키우는 묘미 아닐까 싶습니다 ㅎㅎ'),gap(),
  sub('30여 곳의 브리더가 모이면, 구경할 취향도 넓어집니다'),
  p('전국의 전문 브리더·업체 30여 곳이 함께하는 ‘전국크레자랑’.\n지역별 전문 샵들이 돌아가며 릴레이로 라이브를 열어\n각자의 브리딩 철학과 시간으로 빚어낸 개성 넘치는 아이들을 선보입니다.\n\n매주 월요일과 수요일 밤 8시, 네이버 밴드 라이브에서\n실시간 움직임과 먹이 반응, 발색을 확인하며 나만의 취향을 찾아보세요!\n당장 입양 계획이 없으셔도 편하게 랜선 힐링하러 오시면 됩니다 ^^'),gap(),
  sub('마음에 쏙 드는 아이를 낙찰받으셨다면'),
  p('낙찰 즉시 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n전용 페이지에서 내역 확인과 간편 결제를 한 번에 진행하실 수 있고,\n배송 정보는 최초 1회만 등록해 두시면 다음번 낙찰에도 그대로 자동 적용됩니다.\n\n아이들은 집 근처 제휴 전문 샵에서 건강 상태를 직접 확인하고 픽업하시는 안전한 방식입니다.'),gap(),
  h('첫 번째 취향 탐색은 서울·인천부터!'),
  p('10월 14일 수요일 밤 8시, 대망의 첫 방송에서 만나요.\n첫 방송 낙찰자 1인당 배송비 최대 3만 원 전액 지원 혜택도 드립니다.\n\n회원님들은 어떤 스타일의 크레를 가장 좋아하시나요? 댓글로도 편하게 나눠주세요!\n저희도 정말 멋진 아이들로 정성껏 준비해서 기다리겠습니다 ^^'),
  p('※ 사진은 AI 연출 이미지입니다. 실제 출품 개체는 방송에서 생생하게 확인해 주세요.'),...footer
 ]},
 {id:'launch26-tour',name:'랜선 샵 투어형 · 거리 대신 한 밴드',title:'🧭 멀어서 못 가본 샵들, 이번엔 한 밴드에서 만나봅니다',catalogOrder:5,blocks:[
  h('눈여겨본 샵은 전국 각지에,\n나는 오늘도 우리 동네에…'),gap(),
  p('안녕하세요 파사모 회원님들, [업체명]입니다!\n인스타나 카페 피드 보면서 “와, 여기 샵 아이들 실물로 꼭 보고 싶다” 했다가\n지도 검색해 보고 너무 멀어서 조용히 뒤로 가기 누르신 적 다들 있으시죠? ㅎㅎ\n마음은 이미 전국 샵 투어 중인데, 바쁜 일상에 주말마다 멀리 찾아가기는 참 쉽지 않습니다.'),
  image('tour-v6.jpg','작은 크레를 소개하는 브리더와 샵을 구경하는 집사 · 얼굴 없는 AI 연출 이미지'),
  sub('샵이 있는 지역은 달라도, 크레는 한 밴드에서 만납니다!'),
  p('그래서 전국의 전문 브리더·업체 30여 곳이 의기투합했습니다.\n서울·인천부터 경기, 대구·경북, 부산·울산·경남, 전라·충청까지!\n\n각 지역을 대표하는 실력파 샵들이 돌아가며 정성껏 키운 아이들을 소개하는\n대한민국 최초의 릴레이 라이브 경매, ‘전국크레자랑’입니다.\n직접 장거리 운전하며 돌아다니실 필요 없이, 전국의 명품 크레들을 안방 1열에서 차례로 만나보세요.'),gap(),
  sub('월·수 밤 8시, 안방에서 떠나는 전국 크레 샵 투어'),
  p('평소 눈여겨보던 유명 샵의 개체도 보고, 숨은 고수 업체의 아이도 새롭게 발견하고!\n실시간 고화질 영상으로 피지컬과 움직임을 보며 브리더의 생생한 설명까지 들으시면\n사진 몇 장으로 구경할 때와는 비교할 수 없는 짜릿한 재미가 있습니다.\n\n방송은 매주 월요일과 수요일 밤 8시 고정!\n퇴근 후 편안한 마음으로 들어오셔서, 이번엔 어느 동네 아이들이 나오나 즐겁게 구경해 주세요.'),gap(),
  sub('멀리 있는 샵의 아이, 낙찰 후에는 어떻게 수령하나요?'),
  p('낙찰 시 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 원클릭으로 확인하시고,\n배송 주소는 최초 1회만 등록해 두시면 다음번에도 그대로 자동 적용됩니다.\n\n쌀쌀해진 환절기에 고속버스 택배 걱정 없이,\n집 근처 제휴 전문 매장에서 안전하게 아이를 인계받으실 수 있습니다.'),gap(),
  h('첫 번째 샵 투어 행선지는 서울·인천!'),
  p('10월 14일 수요일 밤 8시, 대장정의 첫 테이프를 끊습니다!\n첫 방송을 함께해 주시는 낙찰자분들께는 1인당 배송비 최대 3만 원을 전액 지원해 드립니다.\n\n멀어서 눈으로만 찜해두셨던 전국 각지의 크레들,\n이번엔 ‘전국크레자랑’ 밴드에서 편안하게 랜선 투어로 만나보세요 ^^'),
  p('※ 사진은 샵 투어의 분위기를 연출한 이미지입니다.'),...footer
 ]},
 {id:'launch26-breeder',name:'브리더 준비 노트형 · 방송 전의 설렘',title:'🦎 방송에 꺼내 놓을 아이들, 저희도 설레는 마음으로 준비합니다',catalogOrder:6,blocks:[
  h('라이브 방송을 기다리는 건\n집사님들만이 아닙니다'),gap(),
  p('안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n이번에 전국의 동료 브리더들과 함께 ‘전국크레자랑’ 라이브를 준비하며 인사드립니다.\n\n예쁜 아이들을 기다려주시는 집사님들도 두근거리시겠지만,\n“어떤 아이를 데리고 나가야 회원님들이 감탄하실까?” 고민하며\n축양장을 둘러보는 저희 사장들도 정말 가슴이 뜁니다 ㅎㅎ\n사진 한 장에는 차마 다 담기지 않는 아이들의 진짜 매력을 방송에서 속 시원히 보여드리고 싶거든요.'),
  image('prep-v6.jpg','촬영 카메라 앞에서 작은 크레를 소개하는 흰 장갑 낀 손 · AI 연출 이미지'),
  sub('빛나는 무늬 뒤에는, 정성으로 키워낸 브리더의 이야기가 있습니다'),
  p('이 아이는 어떤 라인에서 태어났는지, 자라면서 발색이 어떻게 올라오는지,\n어떤 포인트를 눈여겨보시면 좋을지.\n\n방송에서는 아이의 컨디션과 활발한 움직임을 여과 없이 보여드리면서\n아이마다 담긴 사육 이야기까지 친근하게 들려드리려 합니다.\n궁금하신 점은 실시간 채팅으로 편하게 물어봐 주세요!'),gap(),
  sub('한 샵만의 방송이 아닌, 전국 30여 개 브리더들의 릴레이 축제'),
  p('전국의 검증된 전문 브리더와 매장 30여 곳이 함께 만드는 상생 라이브입니다.\n회차마다 다른 지역의 전문 샵들이 돌아가며 출연하기 때문에,\n한 밴드 안에서도 매번 새로운 브리딩 스타일과 신선한 아이들을 만나실 수 있습니다.\n\n매주 월요일과 수요일 밤 8시!\n자존심을 걸고 정성껏 키운 명품 크레들을 안방 1열에서 소개해 드리겠습니다.'),gap(),
  sub('경매 낙찰 뒤의 절차도 가장 편리하게 갖췄습니다'),
  p('낙찰 즉시 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 바로 확인하실 수 있고,\n배송 주소도 최초 1회만 등록해 두시면 다음번 낙찰에도 그대로 자동 적용됩니다.\n\n아이들은 찬바람 부는 날씨에도 안전하도록\n집 근처 협력 매장에서 실물 컨디션을 직접 확인하시고 픽업하시는 방식입니다.'),gap(),
  h('10월 14일 수요일 밤 8시, 서울·인천부터 첫인사 올립니다!'),
  p('대망의 첫 방송은 10월 14일 수요일 밤 8시에 시작합니다.\n첫 방송 낙찰자 전원에게 1인당 배송비 최대 3만 원을 시원하게 지원해 드립니다.\n\n당장 입양 생각이 없으셔도 좋습니다.\n“우와, 저 샵엔 저런 아이도 있네!” 하시며 편하게 놀러 오셔서 응원 댓글 하나씩 남겨주세요.\n저희도 최고의 컨디션으로 정성껏 준비해서 반갑게 맞이하겠습니다 ^^'),
  p('※ 사진은 방송 준비의 분위기를 연출한 이미지입니다.'),...footer
 ]}
].map(t=>({...t,title:polishPromoTitle(t.id,t.title),blocks:addPromoImages(t.id,polishPromoBlocks(t.blocks)),version:1,bundleVersion:9,active:true}));
async function main(){
 fs.mkdirSync(path.join(output,'이미지'),{recursive:true});
 const before=JSON.parse(fs.readFileSync(path.join(root,'promo-templates.json'),'utf8'));
 const preserved=['launch26-joseon','launch26-showtime','ep01-welcome'];
 const kept=preserved.map(id=>{const t=before.find(t=>t.id===id);if(!t)throw Error('Approved manuscript missing: '+id);return t;});
 const media=JSON.parse(fs.readFileSync(path.join(root,'promo-media.json'),'utf8'));
 for(const t of pack)for(const b of t.blocks.filter(b=>b.type==='image')){
  const src=path.join(root,'public',b.src);if(!fs.existsSync(src))throw Error('Missing '+src);
  media[b.src]='https://creok.onrender.com'+b.src;
  await sharp(src).resize(800,450,{fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(src.replace(/\.[^.]+$/,'.thumb.webp'));
 }
 const later=before.filter(t=>!preserved.includes(t.id)&&!pack.some(p=>p.id===t.id));
 fs.writeFileSync(path.join(root,'promo-templates.json'),JSON.stringify([...kept,...pack,...later],null,2)+'\n');
 fs.writeFileSync(path.join(root,'promo-media.json'),JSON.stringify(media,null,2)+'\n');
 for(const [i,t]of pack.entries()){
  const blocks=[image('hero-seoul-incheon-v3.png','전국크레자랑 · EP 01. 서울·인천'),...t.blocks];
  const index=blocks.findIndex(b=>b.href);blocks.splice(index,0,image('ticket-seoul-incheon-v2.png','첫 방송 서울·인천 편 · 배송비 무료 · 낙찰자 1인당 최대 3만 원 지원'));
  const name=String(i+1).padStart(2,'0')+'_'+t.name.split(' · ')[0];
  const html=blocks.map(b=>b.type==='image'?`<p align="center" style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p align="${b.align||'center'}" style="text-align:${b.align||'center'};font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;font-size:${b.size}px;font-weight:${b.bold?700:400};line-height:1.75;margin:0;word-break:keep-all;overflow-wrap:anywhere;color:${b.color==='green'?'#007443':'#202632'}">${b.href?'<a href="'+b.href+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`).join('');
  fs.writeFileSync(path.join(output,name+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{max-width:532px;padding:24px 16px;margin:auto;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif;color:#202632;text-align:center}h1{font-size:20px;line-height:1.5;margin-bottom:40px;text-align:center}a{color:#007443}</style><h1>${esc(t.title)}</h1><article>${html}</article></html>`);
  fs.writeFileSync(path.join(output,name+'.txt'),t.title+'\n\n'+blocks.map(b=>b.type==='image'?'[이미지: '+b.alt+']':b.text+(b.href?'\n'+b.href:'')).join('\n'));
  for(const b of blocks.filter(b=>b.type==='image'))fs.copyFileSync(path.join(root,'public',b.src),path.join(output,'이미지',path.basename(b.src)));
 }
 fs.writeFileSync(path.join(output,'추가원고3종.json'),JSON.stringify(pack,null,2)+'\n');
 console.log(JSON.stringify(pack.map(t=>({id:t.id,title:t.title,characters:t.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length}))));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
