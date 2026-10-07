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
  h('전국~~~~ 크레자랑!'),gap(),
  p('안녕하세요 파사모 회원님들! 이번에 함께하게 된 [업체명] 사장입니다 ^^\n다들 일요일 낮마다 전국노래자랑 한 번쯤 보셨죠? ㅎㅎ\n동네마다 숨은 명가수분들이 나오는 것처럼,\n우리 크레 판에도 지역마다·샵마다 꼭꼭 숨겨둔 보물 같은 아이들이 정말 많거든요.'),
  image('festival-stage-v5.jpg','마이크를 든 진행자가 맞이하는 야외무대 · AI 연출'),
  sub('“우리 동네에 이런 크레가 있습니다”'),
  p('그래서 전국의 전문 브리더·업체 30여 곳이 뭉쳐서\n이름 그대로 ‘전국크레자랑’을 제대로 열어보기로 했습니다!\n\n매주 지역별로 돌아가며 각 샵의 자존심을 걸고,\n정성껏 키운 아이들을 라이브 방송으로 속 시원하게 자랑하고 경매도 진행합니다.'),gap(),
  p('사진 보정이나 조명 왜곡 없이,\n실시간 라이브 영상으로 아이들의 실제 피지컬과 움직임, 발색을 눈으로 직접 확인하실 수 있습니다.'),
  image('festival-cre-v5.jpg','서로 다른 무늬의 작은 크레를 소개하는 장갑 낀 손 · AI 연출'),
  sub('월·수 밤 8시, 안방 1열에서 신나게 구경하세요'),
  p('방송은 매주 월요일과 수요일 밤 8시, 네이버 밴드 라이브로 찾아갑니다.\n채팅으로 편하게 소통도 하시고, 마음에 쏙 드는 아이가 나오면 실시간 경매로 손맛도 느껴보세요!'),gap(),
  sub('낙찰 뒤 입금·배송도 번거로움 없이 깔끔하게'),
  p('낙찰받으시면 카카오톡 알림톡으로 전용 결제 페이지가 자동으로 도착합니다.\n사장들한테 일일이 계좌 물어보실 필요 없이 결제도 간편하고,\n배송 정보도 최초 1회만 등록해 두시면 다음번 낙찰에도 그대로 자동 적용됩니다.\n\n날씨가 쌀쌀해진 환절기인 만큼, 택배 폐사 걱정 없도록\n집 근처 제휴 전문 샵에서 아이 컨디션 직접 눈으로 확인하시고 픽업하시는 방식입니다.'),gap(),
  h('대망의 첫 자랑은 서울·인천부터!'),
  p('10월 14일 수요일 밤 8시, 서울·인천 편으로 첫 테이프를 끊습니다!\n첫 방송 기념으로 낙찰자 1인당 배송비 최대 3만 원 전액 지원 혜택도 함께 드립니다.\n\n꼭 입양 계획이 없으셔도 괜찮으니,\n어느 동네 크레가 제일 예쁜지 편하게 들어오셔서 구경도 하시고 응원 댓글 하나씩 남겨주세요 ^^',{align:'center'}),
  p('※ 위 무대·크레 사진은 AI 연출이며 실제 출연자·출품 개체가 아닙니다'),...footer
 ]},
 {id:'ep01-welcome',name:'입찰자 인터뷰형 · 구경보다 바빴던 날',title:'💬 “크레는 보고 싶은데, 방송 찾는 게 일이더라고요”',catalogOrder:3,blocks:[
  h('“애들 구경 좀 하려고 켰는데\n찾아다니느라 제가 더 바쁘더라고요”'),gap(),
  p('안녕하세요 파사모 회원님들! 크레 키우고 분양하는 [업체명]입니다 ^^\n매장에서 손님들이랑 이야기 나누다 보면,\n온라인 경매 자주 보시는 집사님들께서 다들 입을 모아 공감하시는 부분이 있더라고요.'),
  image('interview-home-v5.jpg','휴대폰을 든 집사와 마이크 · 얼굴이 보이지 않는 AI 연출 사진'),
  sub('“좋아하는 샵 방송 시간 챙기는 게 은근히 일이더라고요”'),
  p('“이 밴드 저 밴드 가입해 둬도 샵마다 방송 요일이랑 시간이 제각각이라,\n퇴근하고 깜빡 딴짓하면 보고 싶던 샵 방송은 이미 끝나 있고…\n\n어렵게 낙찰받아도 계좌 번호 어디 있었지 찾고,\n배송 주소 일일이 톡으로 보내고, 다음번 낙찰 때 또 똑같이 적고…\n솔직히 아이들 보는 건 너무 좋은데 이 과정들이 참 번거롭고 피곤했어요.”'),gap(),
  h('그래서, 전국의 브리더들이 한 밴드에 모였습니다'),gap(),
  p('집사님들의 그 현실적인 고충에 깊이 공감해서,\n전국의 실력파 브리더·전문 매장 30여 곳이 뜻을 모았습니다.\n\n이제 여기저기 알림 켜두고 헤매실 필요 없이,\n‘전국크레자랑’ 밴드 딱 한곳에서 전국의 다양한 크레들을 만나실 수 있습니다!'),gap(),
  sub('매주 월·수 밤 8시 정기 방송 & 카톡 원클릭 정산'),
  p('방송은 매주 월요일과 수요일 밤 8시!\n지역별 전문 업체들이 순서대로 돌아가며 정성껏 키운 아이들을 라이브로 선보입니다.\n\n낙찰 안내도 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n톡 안의 링크에서 낙찰 내역과 결제 안내를 바로 확인하실 수 있고,\n등록해 두신 배송 주소는 다음 낙찰에도 그대로 자동 적용됩니다.'),
  image('after-bid-v5.png','카카오톡 알림톡 → 전용 페이지 확인 → 집 근처 업체 픽업'),
  sub('환절기에도 안심하는 집 근처 매장 픽업'),
  p('요즘 아침저녁으로 날씨가 쌀쌀해져서 일반 택배 배송 많이 걱정되시죠?\n아이가 다치지 않도록 거주지 근처 제휴 전문 샵으로 안전하게 이동되어,\n직접 두 눈으로 건강 상태를 확인하고 데려오실 수 있습니다.'),gap(),
  sub('첫 방송 : 10월 14일 수요일 밤 8시 【서울·인천 편】'),
  p('10월 14일 수요일 밤 8시, 서울·인천 대표 샵들의 개체들로 첫 방송이 시작됩니다!\n첫 방송을 함께해 주시는 낙찰자분들께는 1인당 배송비 최대 3만 원을 전액 지원해 드립니다.\n\n이제 방송 찾아다니느라 피곤해하지 마시고,\n월·수 밤 8시에 안방에서 편하게 예쁜 크레들 구경하러 놀러 오세요 ^^'),...footer
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
