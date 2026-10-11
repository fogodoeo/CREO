'use strict';
// Prepare this manuscript only; preserve every other catalog entry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const asset='/promo-assets/seoul-incheon-premiere-map-v7.png';
const p=(text,extra={})=>({type:'text',text,size:16,bold:false,color:'ink',align:'center',...extra});
const gap=()=>p('');
const sub=text=>p(text,{size:20,bold:true});
const template={
 id:'launch26-seoul-incheon-map',name:'서울·인천 첫 방송 · 지도 안내형',
 title:'서울·인천 크레들이 한자리에｜10.14 수요일 밤 8시 첫 방송',
 catalogOrder:10,version:1,bundleVersion:1,active:true,
 blocks:[
  {type:'image',src:asset,alt:'전국크레자랑 서울·인천 편 첫 방송 포스터. 인천은 왼쪽, 서울은 오른쪽 지도에 참여업체 배치. 10월 14일 수요일 밤 8시, 낙찰자 1인당 배송비 최대 3만원 지원.',width:500},
  p('서울·인천, 이제 한 밴드에서 만나요',{size:26,bold:true}),gap(),
  p('안녕하세요 파사모 회원님들\n[업체명]입니다.\n\n평소 눈여겨보던 샵도, 아직 가보지 못한 샵도.\n이번엔 한 밴드에서 함께 만나보세요.\n전국크레자랑의 첫 방송은 서울·인천 편으로 시작합니다.'),
  gap(),
  sub('10월 14일 수요일 밤 8시\n전국크레자랑 첫 방송'),
  {type:'image',src:'/promo-assets/live-question-v1.jpg',alt:'손 위의 크레스티드게코를 카메라 앞에서 소개하는 장면',width:500},
  p('서울과 인천의 브리더들이 각자의 크레를 소개합니다.\n아이들의 움직임과 특징을 라이브로 살펴보고,\n궁금한 점은 편하게 물어봐 주세요.\n\n입양 계획이 없어도 괜찮습니다.\n크레를 좋아하는 분이라면 누구나 구경하러 오세요.'),gap(),
  sub('이번 서울·인천 편 참여업체'),
  p('인천',{size:18,bold:true}),
  p('크레리즘 · 오케이게코'),gap(),
  p('서울',{size:18,bold:true}),
  p('더숲·크레숲 · 렙소디 · 카민렙타일\n더블디게코 · 크레버디\n스텔라게코 · 베누스게코'),gap(),
  sub('첫 방송 배송비 무료'),
  p('*낙찰자 1인당 최대 3만원 지원',{size:18,bold:true,color:'green'}),
  p('첫 방송에서 마음에 드는 아이를 만나셨다면,\n배송비 지원 혜택도 함께 챙겨주세요.\n\n아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 배송됩니다.\n도착 후 상태를 직접 확인하고 픽업하시면 됩니다.'),gap(),
  {type:'image',src:'/promo-assets/tour-nearby-pickup-v1.jpg',alt:'매장에서 크레스티드게코의 상태를 확인하고 만나는 장면',width:500},
  sub('서울·인천에서 시작해, 다음 지역으로'),
  p('이번 서울·인천 편을 시작으로\n지역별 전문 업체가 돌아가며 참여합니다.\n매주 월요일과 수요일 밤 8시,\n네이버 밴드에서 크레 구경을 이어가세요.'),gap(),
  p('첫 방송을 놓치지 않게 밴드에 미리 가입해 두세요.\n10월 14일 수요일 밤 8시, 방송에서 뵙겠습니다.'),gap(),
  {type:'image',src:'/promo-assets/ticket-seoul-incheon-v2.png',alt:'첫 방송 서울·인천 편 배송비 무료 · 낙찰자 1인당 최대 3만원 지원',width:500},
  p('전국크레자랑 밴드 바로가기',{size:18,bold:true,color:'green',href:'https://band.us/n/a6a6beMe97Ucc'}),
  p('네이버 밴드에서 ‘전국크레자랑’ 검색')
 ]
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function main(){
 const output=process.argv[2];
 if(!output)throw Error('Provide the local manuscript export folder.');
 const seedPath=path.join(root,'promo-templates.json'),mediaPath=path.join(root,'promo-media.json');
 const before=JSON.parse(fs.readFileSync(seedPath,'utf8'));
 const merged=before.some(t=>t.id===template.id)?before.map(t=>t.id===template.id?template:t):[...before,template];
 assert.deepEqual(merged.filter(t=>t.id!==template.id),before.filter(t=>t.id!==template.id));
 assert.equal(merged.filter(t=>t.id===template.id).length,1);
 assert.ok(fs.existsSync(path.join(root,'public',asset)),'Poster must already be copied into public assets.');
 const media=JSON.parse(fs.readFileSync(mediaPath,'utf8'));
 for(const b of template.blocks.filter(b=>b.type==='image'))media[b.src]='https://creok.onrender.com'+b.src;
 fs.writeFileSync(seedPath,JSON.stringify(merged,null,1)+'\n','utf8');
 fs.writeFileSync(mediaPath,JSON.stringify(media,null,2)+'\n','utf8');
 const sharp=require('sharp');
 await sharp(path.join(root,'public',asset)).resize({width:640}).webp({quality:88}).toFile(path.join(root,'public',asset.replace('.png','.thumb.webp')));
 const actual=merged.find(t=>t.id===template.id);
 fs.mkdirSync(path.join(output,'이미지'),{recursive:true});
 for(const b of actual.blocks.filter(b=>b.type==='image'))fs.copyFileSync(path.join(root,'public',b.src),path.join(output,'이미지',path.basename(b.src)));
 const html=actual.blocks.map(b=>b.type==='image'?`<p style="text-align:center;margin:20px 0"><img src="이미지/${path.basename(b.src)}" alt="${esc(b.alt)}" width="500" style="width:500px;max-width:100%;height:auto"></p>`:`<p align="center" style="text-align:center;font-family:NanumSquareNeo,'나눔스퀘어 네오','Malgun Gothic',sans-serif;font-size:${b.size}px;font-weight:${b.bold?700:400};line-height:1.75;margin:0;word-break:keep-all;overflow-wrap:anywhere">${b.href?'<a href="'+b.href+'">':''}${esc(b.text).replace(/\n/g,'<br>')||'<br>'}${b.href?'</a>':''}</p>`).join('\n');
 fs.writeFileSync(path.join(output,'서울인천_첫방송_지도안내형.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(actual.title)}</title><style>:root{color-scheme:light dark}body{max-width:532px;padding:24px 16px;margin:auto;text-align:center;font-family:'Malgun Gothic',sans-serif}h1{font-size:20px;line-height:1.5;margin-bottom:40px}</style><h1>${esc(actual.title)}</h1><article>${html}</article></html>`,'utf8');
 fs.writeFileSync(path.join(output,'서울인천_첫방송_지도안내형.txt'),actual.title+'\n\n'+actual.blocks.filter(b=>b.type==='text').map(b=>b.text+(b.href?'\n'+b.href:'')).join('\n'),'utf8');
 fs.writeFileSync(path.join(output,'추가원고.json'),JSON.stringify(actual,null,2)+'\n','utf8');
 console.log(JSON.stringify({id:actual.id,totalSeeds:merged.length,priorSeedsPreserved:true,characters:actual.blocks.filter(b=>b.type==='text').map(b=>b.text).join('').length}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={template};
