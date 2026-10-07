'use strict';
// Authoring source for the five launch manuscripts. Does not modify saved operator content.
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const band='https://band.us/n/a6a6beMe97Ucc';
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,align:'center',color:'ink',...extra});
const h=text=>p(text,{size:24,bold:true});
const sub=text=>p(text,{size:18,bold:true});
const gap=()=>p('');
const img=(file,alt)=>({type:'image',src:'/promo-assets/'+file,alt,width:500});
const link=()=>p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',href:band});
const benefit=[sub('첫 방송 배송비 지원'),p('※ 낙찰자 1인당 최대 3만 원')];
const launch=[sub('10월 14일 수요일 밤 8시'),p('첫 방송은 서울·인천과 함께합니다')];
const pack=[
 {id:'launch26-joseon',name:'조선시대 · 손바닥만 한 용',title:'👑 전하, 손바닥만 한 용을 보셨습니까',blocks:[
  h('전하, 저잣거리에\n용이 나타났다 하옵니다'),gap(),
  p('“용이라? 크기가 얼마나 되느냐?”\n“손바닥만 하옵니다.”',{size:18}),
  img('joseon.png','작은 크레를 보고 미소 짓는 임금과 신하 · 콘셉트 일러스트'),
  p('고을마다 곱게 키운 크레 소식이 자자하여\n이번에는 한자리에 모아 보기로 했습니다.'),gap(),
  sub('이름하여 전국크레자랑'),
  p('30여 곳의 전문 브리더·업체가 함께하는\n네이버 밴드 크레스티드게코 라이브 경매입니다.\n매주 다른 지역의 업체와 다양한 크레를 만납니다.'),gap(),
  sub('장터는 월요일과 수요일, 밤 8시에 열립니다'),
  p('먼 길 나서실 필요는 없습니다.\n밴드에서 실시간으로 구경하고 참여해 주세요.'),gap(),
  sub('낙찰 뒤의 수고도 덜었습니다'),
  p('카카오톡 알림톡이 자동으로 발송되고\n연결된 전용 페이지에서 낙찰 내역과 결제 안내를 확인합니다.\n배송 정보는 한 번 등록하면 다음에도 그대로 사용합니다.\n수령은 집 근처 업체에서 픽업하는 방식입니다.'),gap(),
  ...launch,gap(),...benefit,gap(),
  p('구경만 하셔도 좋습니다.\n어느 고을의 크레가 마음에 드실지, 함께 보시지요.'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
 ]},
 {id:'launch26-collector',name:'집사 공감 · 서로 다른 취향',title:'💚 지역은 달라도, 크레에 진심인 건 같으니까',blocks:[
  h('어떤 크레 좋아하세요'),gap(),
  p('또렷한 무늬에 눈길이 가는 분도,\n색감 하나에 마음이 움직이는 분도 계시죠.'),
  img('collector.png','서로 다른 색과 무늬의 크레를 받친 손 · 콘셉트 일러스트'),
  p('취향은 달라도 예쁜 아이를 발견했을 때의\n반가운 마음은 비슷할 것 같습니다.'),gap(),
  sub('여러 지역의 크레를, 한 밴드에서'),
  p('이 밴드 저 밴드에서 찾아보던 업체들을\n한곳에서 만날 수 있도록 전국크레자랑을 준비했습니다.\n30여 곳의 전문 브리더·업체가 함께하며\n지역별로 돌아가며 다양한 크레를 소개합니다.'),gap(),
  sub('매주 월요일·수요일 밤 8시'),
  p('사진만으로 고르기보다\n움직이는 모습과 설명을 라이브로 만나보세요.\n마음에 드는 아이가 있다면 경매에도 참여하실 수 있습니다.'),gap(),
  p('낙찰 뒤에는 자동 알림톡으로 안내해 드립니다.\n톡에 연결된 전용 페이지에서 내역과 결제 안내를 확인하고\n한 번 등록한 배송 정보는 다음에도 그대로 사용합니다.\n집 근처 업체에서 픽업하는 방식입니다.'),gap(),
  ...launch,gap(),...benefit,gap(),
  p('꼭 입양할 계획이 없어도 괜찮습니다.\n내 취향의 크레를 발견하는 시간으로\n편하게 놀러 와주세요.'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
 ]},
 {id:'launch26-editorial',name:'매거진 · 한 밴드에서 만나는 다양함',title:'✨ 한 밴드에서 만나는, 서로 다른 크레의 매력',blocks:[
  p('전국크레자랑',{size:18,bold:true,color:'green'}),h('지역이 바뀌면\n만나는 크레도 달라집니다'),
  img('live.png','흰 장갑 위 작은 크레와 방송 카메라 · AI 연출 이미지, 실제 출품 개체가 아닙니다'),p('※ AI 연출 이미지이며 실제 출품 개체가 아닙니다'),gap(),
  p('크레를 보는 취향도, 브리딩의 방향도\n업체마다 조금씩 다릅니다.\n그 차이를 한자리에서 만나는 방송을 준비했습니다.'),gap(),
  sub('다양한 업체, 하나의 밴드'),
  p('전국의 전문 브리더·업체가 지역별로 돌아가며\n각자의 크레를 소개하는 라이브 경매.\n매번 다른 업체와 개체를 만나는 것이\n전국크레자랑의 가장 큰 매력입니다.'),gap(),
  sub('매주 월요일·수요일 밤 8시'),
  p('네이버 밴드에서 실시간으로 진행합니다.\n움직임을 보고 설명을 들으며 천천히 취향을 찾아보세요.'),gap(),
  sub('안내는 자동으로, 정보 입력은 한 번만'),
  p('낙찰 알림톡이 자동 발송됩니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 확인하고\n등록한 배송 정보는 다음 낙찰에도 그대로 사용합니다.\n수령은 집 근처 업체에서 픽업합니다.'),gap(),
  ...launch,gap(),...benefit,gap(),
  p('새로운 크레를 만나는 시간.\n전국크레자랑에서 함께해 주세요.'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
 ]},
 {id:'launch26-episode',name:'방송 예고 · 이번 주의 크레',title:'🔴 EP.01 — 서울·인천부터, 자랑 한번 해보겠습니다',blocks:[
  p('전국크레자랑 첫 방송',{size:18,bold:true,color:'green'}),h('이번 주엔\n어떤 크레가 나올까요'),gap(),
  p('월요일엔 새로운 발견,\n수요일엔 또 다른 취향.\n일주일에 두 번, 기다릴 방송이 하나 생깁니다.'),
  img('weekly.png','매주 월요일과 수요일 밤 8시, 네이버 밴드 LIVE'),
  sub('첫 자랑은 서울·인천에서'),
  p('10월 14일 수요일 밤 8시\n전국크레자랑의 첫 방송을 시작합니다.\n이후에는 지역별 업체들이 돌아가며\n정성껏 키운 다양한 크레를 선보입니다.'),gap(),
  sub('매회 출연진도, 크레도 새롭게'),
  p('한 업체의 방송을 챙기는 것과는 또 다른 재미.\n여러 업체의 크레를 하나의 밴드에서 만나고\n마음에 드는 아이의 라이브 경매에 참여해 보세요.'),gap(),
  p('낙찰되면 카카오톡 알림톡이 자동으로 도착합니다.\n전용 페이지에서 낙찰 내역과 결제 안내를 확인하고\n배송 정보는 한 번만 등록해 두시면 됩니다.\n수령은 집 근처 업체에서 픽업하는 방식입니다.'),gap(),
  ...benefit,gap(),
  p('입양 계획이 없어도 구경은 환영입니다.\n첫 회부터 함께 보실 집사님들을 기다립니다.'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
 ]},
 {id:'launch26-easy',name:'간편 안내 · 낙찰 그다음까지',title:'💬 크레 고르는 즐거움은 그대로, 낙찰 뒤 번거로움은 줄이고',blocks:[
  h('마음에 드는 크레를 골랐다면\n그다음은 조금 더 편하게'),gap(),
  p('낙찰 내역은 어디서 확인하는지,\n결제 안내는 어디로 오는지.\n여러 곳에 따로 물어보는 수고를 줄였습니다.'),
  img('easy.png','낙찰 알림톡 자동 발송 → 전용 페이지 확인 → 집 근처 업체 픽업'),
  sub('카카오톡으로 자동 안내'),
  p('낙찰 시 카카오톡 채널 알림톡이 자동 발송됩니다.\n톡 안의 링크를 열면 전용 페이지에서\n낙찰 내역과 결제 안내를 확인할 수 있습니다.'),gap(),
  sub('배송 정보는 처음에 한 번'),
  p('처음 등록한 정보는 다음 낙찰에도 그대로 적용됩니다.\n매번 다시 입력할 필요가 없습니다.\n수령은 집 근처 업체에서 픽업하는 방식입니다.'),gap(),
  sub('볼거리는 매주 새롭게'),
  p('전국크레자랑은 여러 지역의 전문 업체가 함께하는\n네이버 밴드 크레스티드게코 라이브 경매입니다.\n지역별로 돌아가며 다양한 크레를 선보입니다.'),gap(),
  sub('매주 월요일·수요일 밤 8시'),p('첫 방송 10월 14일 수요일 · 서울·인천'),gap(),
  ...benefit,gap(),
  p('예쁜 아이들 구경하러 편하게 오세요.\n낙찰 이후의 안내까지 차근차근 준비해 두겠습니다.'),gap(),link(),p('네이버 밴드에서 ‘전국크레자랑’ 검색')
 ]}
].map(t=>({...t,version:1,active:true}));
async function main(){
 const weekly=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="480" viewBox="0 0 1500 480"><rect width="1500" height="480" fill="#f1f4f2"/><circle cx="1260" cy="95" r="15" fill="#008854"/><text x="90" y="93" font-family="Malgun Gothic" font-weight="700" font-size="29" fill="#32604c">매주 두 번, 새로운 크레를 만나는 시간</text><text x="83" y="292" font-family="Malgun Gothic" font-weight="700" font-size="152" fill="#163c2c">월 · 수</text><path d="M800 130V365" stroke="#c5d4cc" stroke-width="2"/><text x="890" y="278" font-family="Malgun Gothic" font-weight="700" font-size="103" fill="#163c2c">밤 8시</text><text x="90" y="406" font-family="Malgun Gothic" font-size="32" fill="#32604c">네이버 밴드 LIVE</text></svg>`;
 const easy=`<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="420" viewBox="0 0 1500 420"><rect width="1500" height="420" fill="#f5f6f8"/><g font-family="Malgun Gothic" fill="#202632"><text x="90" y="80" font-size="28" font-weight="700">낙찰 그다음까지, 간편하게</text><g text-anchor="middle"><rect x="90" y="124" width="340" height="170" rx="22" fill="#fee500"/><text x="260" y="189" font-size="26">자동 발송</text><text x="260" y="250" font-size="44" font-weight="700">카톡 알림톡</text><text x="490" y="234" font-size="52" fill="#728176">→</text><rect x="550" y="124" width="380" height="170" rx="22" fill="#e0ebe5"/><text x="740" y="189" font-size="26">내역 · 결제 안내</text><text x="740" y="250" font-size="44" font-weight="700">전용 페이지</text><text x="990" y="234" font-size="52" fill="#728176">→</text><rect x="1050" y="124" width="360" height="170" rx="22" fill="#e0ebe5"/><text x="1230" y="189" font-size="26">집 근처 업체에서</text><text x="1230" y="250" font-size="44" font-weight="700">픽업</text></g><text x="90" y="367" font-size="28" fill="#526359">배송 정보는 한 번 등록하면 다음에도 그대로</text></g></svg>`;
 for(const [name,svg]of [['weekly',weekly],['easy',easy]]){fs.writeFileSync(path.join(root,'public/promo-assets',name+'.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(path.join(root,'public/promo-assets',name+'.png'));}
 const file=path.join(root,'promo-templates.json');let existing=JSON.parse(fs.readFileSync(file,'utf8'));existing=existing.filter(t=>!pack.some(p=>p.id===t.id));fs.writeFileSync(file,JSON.stringify([...existing,...pack],null,2)+'\n');
 const mf=path.join(root,'promo-media.json'),media=JSON.parse(fs.readFileSync(mf,'utf8'));for(const name of ['joseon','collector','live','weekly','easy'])media['/promo-assets/'+name+'.png']='https://creok.onrender.com/promo-assets/'+name+'.png';fs.writeFileSync(mf,JSON.stringify(media,null,2)+'\n');
 const out='C:/Users/5600x/Desktop/전크자/output/promo-center/원고5종';fs.mkdirSync(path.join(out,'이미지'),{recursive:true});
 for(const name of ['joseon','collector','live','weekly','easy'])fs.copyFileSync(path.join(root,'public/promo-assets',name+'.png'),path.join(out,'이미지',name+'.png'));
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=t=>t.blocks.map(b=>{
  if(b.type==='image')return `<p style="margin:24px 0;text-align:center"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="max-width:100%;height:auto"></p>`;
  return `<p style="margin:0;text-align:${b.align};font-size:${b.size}px;line-height:1.75;color:${b.color==='green'?'#007443':'#202632'};font-weight:${b.bold?700:400}">${b.href?'<a style="color:inherit" href="'+b.href+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`;
 }).join('');
 const labels=['01_조선시대','02_집사공감','03_매거진','04_방송예고','05_간편안내'];
 pack.forEach((t,i)=>{fs.writeFileSync(path.join(out,labels[i]+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>body{margin:0;background:#f4f5f7;font-family:'NanumSquare','Malgun Gothic',sans-serif;color:#202632}header,article{max-width:500px;margin:24px auto;padding:24px;background:white;border-radius:12px}header{font-size:14px}header h1{font-size:20px;line-height:1.5}article{overflow-wrap:anywhere}a{color:#007443}img{display:block;max-width:100%;height:auto}@media(max-width:550px){header,article{margin:0;border-radius:0;padding:24px 16px}}</style><header><a href="index.html">원고 5종 목록</a><h1>${esc(t.title)}</h1><p>${esc(t.name)}</p></header><article>${html(t)}</article></html>`);fs.writeFileSync(path.join(out,labels[i]+'.txt'),t.title+'\n\n'+t.blocks.map(b=>b.type==='image'?'[이미지: '+b.alt+']':b.text+(b.href?'\n'+b.href:'')).join('\n')+'\n');});
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>전국크레자랑 홍보 원고 5종</title><style>body{font-family:'Malgun Gothic',sans-serif;background:#f4f5f7;color:#202632;max-width:760px;margin:auto;padding:32px 20px}h1{font-size:28px}a{color:inherit;text-decoration:none}section{background:white;border:1px solid #e1e5e9;border-radius:16px;overflow:hidden;margin:20px 0}img{width:100%;display:block}section div{padding:20px}h2{font-size:20px;line-height:1.5}p{line-height:1.7}small{color:#55625c}</style><h1>전국크레자랑 홍보 원고 5종</h1><p>조선시대부터 담백한 이용 안내까지<br>2026년 10월 14일 첫 방송 · 서울·인천</p>${pack.map((t,i)=>`<section><a href="${labels[i]}.html"><img src="이미지/${path.basename(t.blocks.find(b=>b.type==='image').src)}" alt=""><div><small>${esc(t.name)}</small><h2>${esc(t.title)}</h2><p>완성 원고 보기 →</p></div></a></section>`).join('')}<p>운영 홍보 관리에서도 선택·복사할 수 있습니다. 카페 등록은 하지 않았습니다.</p></html>`);
 fs.writeFileSync(path.join(out,'원고5종.json'),JSON.stringify(pack,null,2));console.log(pack.map(t=>({id:t.id,characters:t.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length})));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
