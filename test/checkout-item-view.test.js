const test=require('node:test'),assert=require('node:assert/strict');
const {pictures,lotLabel,imageUrl,itemTitle,traitSummary,parentDetails}=require('../public/checkout-item-view');
const origin='https://creok.onrender.com';
test('animal headings avoid repeated IDs and parent text can exist without a photo placeholder',()=>{
 assert.equal(itemTitle({displayNumber:'A01',name:'A01'}),'A01');
 assert.equal(itemTitle({displayNumber:'A01',name:'개체 이름'}),'A01 · 개체 이름');
 assert.equal(traitSummary({traits:{morph:'릴리화이트',sex:'female',weight:'28'}}),'릴리화이트 · 암컷 · 28g');
 assert.equal(parentDetails({parents:[null,{role:'dam',name:'사진 없는 부모',media:[]}]}).length,1);
 assert.match(pictures({parents:[{role:'sire',name:'부모',media:['/s.webp']}],parentInfoState:'snapshot'},origin)[0].label,/등록 당시 자료/);
});
test('photo URL policy rejects script, credentials and unrelated external origins',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg/>','http://169.254.169.254/','https://example.com/x','https://user:pass@creok.onrender.com/x','//evil.test/photo','https://creok.onrender.com/\nphoto'])assert.equal(imageUrl(url,origin),'',url);
 assert.equal(imageUrl('/photos/a.webp',origin),origin+'/photos/a.webp');
 assert.equal(imageUrl('https://demo.supabase.co/storage/v1/object/public/pets/a.webp',origin),'https://demo.supabase.co/storage/v1/object/public/pets/a.webp');
});
test('text-only items do not invent photo or parent placeholders',()=>{
 assert.deepEqual(pictures({id:'a',name:'개체'},origin),[]);
 assert.deepEqual(pictures({photoUrl:'javascript:bad',parents:[{role:'sire',name:'부 이름'}]},origin),[]);
});
test('ordered child and parent pictures dedupe within group, keep attribution, and do not fetch full size for thumbnails',()=>{
 const p=pictures({media:[{url:'/a.webp',thumbnailUrl:'/a-small.webp'},'/a.webp','/b.webp'],parents:[{role:'sire',name:'부 이름',media:['/s.webp']},{role:'dam',name:'모 이름',media:['/d.webp']}]},origin);
 assert.deepEqual(p.map(x=>x.group),['개체','개체','부','모']);
 assert.equal(p[0].thumbnailUrl,origin+'/a-small.webp');assert.equal(p[1].thumbnailUrl,'');assert.match(p[2].label,/부 이름/);
});
test('legacy parent fields remain compatible and long photo collections are bounded',()=>{
 assert.deepEqual(pictures({photoItem:'/i.webp',attributes:{photo_sire:'/s.webp',photo_dam:'/d.webp'}},origin).map(x=>x.group),['개체','부','모']);
 assert.equal(pictures({media:Array.from({length:30},(_,i)=>'/'+i+'.webp')},origin).length,12);
});
test('lot codes retain A/B numbering without turning missing values into lot zero',()=>{
 assert.equal(lotLabel({lotNumber:'A01'}),'A01');assert.equal(lotLabel({lotNumber:3}),'03');assert.equal(lotLabel({lotNumber:0}),'');assert.equal(lotLabel({lotCode:'B15',lotNumber:30}),'B15');
});
