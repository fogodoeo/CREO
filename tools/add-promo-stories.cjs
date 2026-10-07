'use strict';
// Adds three community-voiced stories while preserving the user's approved manuscripts.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'public/promo-assets');
const output='C:/Users/5600x/Desktop/전크자/output/promo-center/추가원고3종_20261008';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,color:'ink',align:'left',...extra});
const h=text=>p(text,{size:26,bold:true,align:'center'});
const sub=text=>p(text,{size:20,bold:true});
const gap=()=>p('');
const image=(file,alt)=>({type:'image',src:'/promo-assets/'+file,alt,width:500});
const footer=[gap(),p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',align:'center',href:'https://band.us/n/a6a6beMe97Ucc'}),p('네이버 밴드에서 ‘전국크레자랑’ 검색',{align:'center'})];
const pack=[
 {id:'launch26-taste',name:'취향 찾기형 · 어떤 크레에 눈이 가세요',title:'✨ 발색파세요, 화이트 월파세요? 취향 찾으러 오세요',catalogOrder:4,blocks:[
  h('같은 크레를 봐도\n눈이 가는 포인트는 다르죠'),gap(),
  p('안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n크레 보실 때 어디에 가장 먼저 눈이 가세요?\n진한 발색, 꽉 찬 화이트 월, 촘촘한 무늬…\n집사님마다 “이건 못 참지” 하는 포인트가 하나씩 있으시더라고요.'),
  image('taste-v6.jpg','서로 다른 색과 무늬의 크레스티드게코 세 마리 · AI 연출 이미지'),
  sub('내 취향이 아닐 줄 알았는데, 자꾸 보게 되는 아이'),
  p('저희도 아이들을 보고 있으면 참 신기합니다.\n비슷한 색이어도 무늬 하나, 옆모습 하나에 느낌이 달라지거든요.\n평소 좋아하던 스타일도 좋지만,\n생각지 못한 아이에게 눈이 가는 재미도 크레 구경의 매력인 것 같습니다.'),gap(),
  sub('30여 곳이 모이면, 구경할 취향도 넓어집니다'),
  p('전국의 전문 브리더·업체 30여 곳이 함께하는 ‘전국크레자랑’.\n여러 지역의 전문 업체가 돌아가며 참여해\n각자의 취향과 브리딩 방향이 담긴 아이들을 선보입니다.\n\n매주 월요일·수요일 밤 8시, 밴드 라이브에서\n움직임도 보고 설명도 들으며 내 취향을 찾아보세요.\n꼭 입양할 생각이 없어도 구경은 편하게 오셔도 됩니다 ^^'),gap(),
  sub('마음에 드는 아이를 낙찰받았다면'),
  p('카카오톡 채널 알림톡이 자동으로 도착합니다.\n톡 안의 전용 페이지에서 낙찰 내역과 결제 안내를 확인하실 수 있고,\n배송 정보는 한 번 등록해 두시면 다음 낙찰에도 그대로 적용됩니다.\n아이들은 집 근처 업체에서 픽업하는 방식으로 만나게 됩니다.'),gap(),
  h('첫 취향 탐색은 서울·인천부터'),
  p('10월 14일 수요일 밤 8시, 첫 방송에서 만나요.\n첫 방송 낙찰자 1인당 배송비 최대 3만 원도 지원해 드립니다.\n\n회원님들은 어떤 크레를 좋아하시는지 댓글로도 알려주세요.\n저희는 아이들 잘 준비해서 방송에서 인사드리겠습니다 ^^'),
  p('※ 사진은 AI 연출 이미지입니다. 실제 출품 개체는 방송에서 확인해 주세요.'),...footer
 ]},
 {id:'launch26-tour',name:'랜선 샵 투어형 · 거리 대신 한 밴드',title:'🧭 멀어서 못 가본 샵들, 이번엔 한 밴드에서 만나봅니다',catalogOrder:5,blocks:[
  h('눈여겨본 샵은 전국에\n나는 오늘도 우리 동네에'),gap(),
  p('안녕하세요 파사모 회원님들, [업체명]입니다!\n글이나 사진 보고 “여기 아이들 한번 보고 싶다” 했다가\n주소 검색해 보고 조용히 창을 닫으신 적 있으신가요? ㅎㅎ\n마음은 이미 샵 투어 중인데, 막상 시간을 내서 가기는 쉽지 않죠.'),
  image('tour-v6.jpg','작은 크레를 소개하는 브리더와 샵을 구경하는 집사 · 얼굴 없는 AI 연출 이미지'),
  sub('샵이 있는 곳은 달라도, 크레는 한곳에서'),
  p('그래서 전국의 전문 브리더·업체 30여 곳이 함께 모였습니다.\n서울·인천, 경기, 대구·경북, 부산·울산·경남, 전라·충청.\n\n지역별 업체들이 돌아가며 정성껏 키운 아이들을 소개하는\n네이버 밴드 라이브 경매, ‘전국크레자랑’입니다.\n실제 매장을 돌아다니는 대신, 각 업체의 크레를 차례로 만나보는 자리예요.'),gap(),
  sub('월·수 밤 8시, 앉아서 떠나는 크레 구경'),
  p('익숙한 샵의 아이도 보고, 처음 알게 된 업체의 아이도 보고.\n무늬와 움직임을 보면서 설명까지 함께 들으시면\n사진으로만 구경할 때와는 또 다른 재미가 있으실 겁니다.\n\n방송은 매주 월요일과 수요일 밤 8시로 정해 두었습니다.\n퇴근 후 편하게 들어오셔서 이번엔 어느 지역이 나오는지 함께 구경해 주세요.'),gap(),
  sub('멀리 있는 업체의 아이, 낙찰 후에는 어떻게 만나나요'),
  p('낙찰 시 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 확인하시고,\n배송 정보는 최초 한 번 등록하면 다음에도 그대로 사용하실 수 있어요.\n수령은 집 근처 업체에서 픽업하는 방식입니다.'),gap(),
  h('첫 번째 목적지는 서울·인천'),
  p('10월 14일 수요일 밤 8시, 첫 방송을 시작합니다.\n첫 방송 낙찰자 1인당 배송비 최대 3만 원을 지원해 드립니다.\n\n멀어서 눈여겨만 보던 업체가 있으셨다면,\n이번에는 밴드에서 편하게 만나보세요 ^^'),
  p('※ 사진은 샵 투어의 분위기를 표현한 AI 연출 이미지입니다.'),...footer
 ]},
 {id:'launch26-breeder',name:'브리더 준비 노트형 · 방송 전의 설렘',title:'🦎 방송에 꺼내 놓을 아이들, 저희도 설레는 마음으로 준비합니다',catalogOrder:6,blocks:[
  h('방송을 기다리는 건\n집사님들만이 아닙니다'),gap(),
  p('안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n이번 ‘전국크레자랑’에 함께하게 되어 인사드립니다.\n\n아이들 구경하시는 집사님들도 설레시겠지만,\n어떤 아이들을 소개할지 준비하는 저희도 기대가 됩니다.\n사진 한 장으로는 다 담기지 않는 매력을 방송에서 이야기해 보고 싶거든요.'),
  image('prep-v6.jpg','촬영 카메라 앞에서 작은 크레를 소개하는 흰 장갑 낀 손 · AI 연출 이미지'),
  sub('예쁜 무늬 뒤에는, 키운 사람의 이야기도 있죠'),
  p('이 아이는 어떤 포인트가 매력적인지,\n어떤 부분을 눈여겨보시면 좋을지.\n\n방송에서는 크레의 모습과 움직임을 함께 보여드리며\n아이에 대한 설명도 차근차근 들려드리려 합니다.\n궁금한 점은 채팅으로 편하게 남겨 주세요.'),gap(),
  sub('이번에는 저희 샵만의 방송이 아닙니다'),
  p('전국의 전문 브리더·업체 30여 곳이 함께하는 라이브 경매입니다.\n지역별 업체들이 돌아가며 출연하니\n같은 밴드에서도 매회 다른 업체의 아이들을 만나실 수 있어요.\n\n매주 월요일·수요일 밤 8시,\n정성껏 키운 크레들을 한자리에서 소개해 드리겠습니다.'),gap(),
  sub('구경 뒤의 안내도 편하게 준비했습니다'),
  p('낙찰받으시면 카카오톡 채널 알림톡이 자동으로 도착합니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 확인하시고,\n배송 정보는 처음 한 번 등록해 두시면 다음에도 그대로 적용됩니다.\n아이들은 집 근처 업체에서 픽업하는 방식으로 만나실 수 있습니다.'),gap(),
  h('10월 14일, 서울·인천부터 인사드릴게요'),
  p('첫 방송은 10월 14일 수요일 밤 8시에 시작합니다.\n첫 방송 낙찰자 1인당 배송비 최대 3만 원을 지원해 드립니다.\n\n꼭 입양이 아니어도 좋습니다.\n“이런 아이도 있네” 하며 함께 구경해 주시면 반갑겠습니다.\n저희도 잘 준비해서 방송에서 인사드릴게요 ^^'),
  p('※ 사진은 방송 준비의 분위기를 표현한 AI 연출 이미지입니다.'),...footer
 ]}
].map(t=>({...t,version:1,bundleVersion:1,active:true}));
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
 fs.writeFileSync(path.join(root,'promo-templates.json'),JSON.stringify([...kept,...pack],null,2)+'\n');
 fs.writeFileSync(path.join(root,'promo-media.json'),JSON.stringify(media,null,2)+'\n');
 for(const [i,t]of pack.entries()){
  const blocks=[image('hero-seoul-incheon-v3.png','전국크레자랑 · EP 01. 서울·인천'),...t.blocks];
  const index=blocks.findIndex(b=>b.href);blocks.splice(index,0,image('ticket-seoul-incheon-v2.png','첫 방송 서울·인천 편 · 배송비 무료 · 낙찰자 1인당 최대 3만 원 지원'));
  const name=String(i+1).padStart(2,'0')+'_'+t.name.split(' · ')[0];
  const html=blocks.map(b=>b.type==='image'?`<p style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p style="text-align:${b.align};font-family:NanumSquareNeo,'나눔스퀘어 네오',sans-serif;font-size:${b.size}px;font-weight:${b.bold?700:400};line-height:1.7;margin:0;word-break:keep-all;overflow-wrap:anywhere;color:${b.color==='green'?'#007443':'#202632'}">${b.href?'<a href="'+b.href+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`).join('');
  fs.writeFileSync(path.join(output,name+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{max-width:532px;padding:24px 16px;margin:auto;font-family:'NanumSquare Neo','Malgun Gothic',sans-serif;color:#202632}h1{font-size:20px;line-height:1.5;margin-bottom:40px}a{color:#007443}</style><h1>${esc(t.title)}</h1><article>${html}</article></html>`);
  fs.writeFileSync(path.join(output,name+'.txt'),t.title+'\n\n'+blocks.map(b=>b.type==='image'?'[이미지: '+b.alt+']':b.text+(b.href?'\n'+b.href:'')).join('\n'));
  for(const b of blocks.filter(b=>b.type==='image'))fs.copyFileSync(path.join(root,'public',b.src),path.join(output,'이미지',path.basename(b.src)));
 }
 fs.writeFileSync(path.join(output,'추가원고3종.json'),JSON.stringify(pack,null,2)+'\n');
 console.log(JSON.stringify(pack.map(t=>({id:t.id,title:t.title,characters:t.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length}))));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
