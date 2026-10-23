'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom');
const source=file=>fs.readFileSync(require.resolve('../public/'+file),'utf8'),tick=()=>new Promise(setImmediate);
const id='national-cre-20261021',base={id:'banner-existing',name:'기존 안내',imageUrl:'/existing.png'};
async function setup({wrongChannel=false,authenticated=true}={}){
 const {document,window}=parseHTML(source('banner-library.html')),$=key=>document.getElementById(key),calls=[],uploads=[],messages=[],revoked=[],records=new Map([[base.id,base]]);
 let selected=[],files=[],focus=null,failure=null,held=null,uploadFailure=null,commitLost=false;
 Object.defineProperty(document,'activeElement',{get:()=>focus});
 window.HTMLElement.prototype.focus=function(){focus=this;};
 for(const element of document.querySelectorAll('select'))Object.defineProperty(element,'value',{value:'all',writable:true});
 Object.defineProperty($('banner-file'),'files',{get:()=>files});
 $('upload').reset=()=>{files=[];$('banner-name').value='';};
 const dialog=$('discard-dialog');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 window.parent={postMessage:message=>messages.push(JSON.parse(JSON.stringify(message)))};
 window.frameElement=null;
 const location={search:'?channel='+id,origin:'https://test.invalid'};
 const api=async(path,options)=>{
  calls.push([path,options?JSON.parse(options.body):null]);if(held&&options&&path!=='banner-library/import')await held;
  if(failure&&path!=='banner-library/import'&&options)throw failure;
  if(path==='banner-library/import')return{banners:[...records.values()]};
  if(path.endsWith('/broadcast?page=1'))return{channel:{id:wrongChannel?'other':id,name:'10/21 전라·충청'},state:{selectedBannerIds:selected}};
  if(path.endsWith('/banner-selection')){const body=JSON.parse(options.body);selected=body.selected?[...new Set([...selected,body.id])]:selected.filter(value=>value!==body.id);return{state:{selectedBannerIds:selected}};}
  if(path==='banner-library'){
   const body=JSON.parse(options.body).record,record={...body,id:'banner:'+body.imageUrl};records.set(record.id,record);
   if(commitLost){commitLost=false;throw Error('응답을 받지 못했습니다. 다시 시도해 주세요.');}return{record};
  }
  throw Error('Unexpected API '+path);
 };
 vm.runInNewContext(source('banner-library.js'),{document,window,location,URLSearchParams,Uint8Array,btoa,URL:{createObjectURL:()=>'/preview.png',revokeObjectURL:url=>revoked.push(url)},CreoPlatform:{escapeHtml:String,verifyAdmin:async()=>authenticated,api},fetch:async(path,options)=>{
  uploads.push([path,JSON.parse(options.body)]);if(held)await held;
  return uploadFailure?{ok:false,status:uploadFailure.status||503,json:async()=>({error:uploadFailure.message})}:{ok:true,status:201,json:async()=>({url:'/uploaded-'+uploads.length+'.png'})};
 }});
 await tick();
 return{$,document,window,calls,uploads,messages,records,revoked,selected:()=>selected,
  choose(file=new File(['image'],'배너.png',{type:'image/png'})){files=[file];$('banner-file').dispatchEvent(new window.Event('change'));},
  edit(value){$('banner-name').value=value;$('banner-name').dispatchEvent(new window.Event('input',{bubbles:true}));},
  submit:()=>$('upload').onsubmit({preventDefault(){}}),
  fail(value){failure=value;},hold(value){held=value;},failUpload(value){uploadFailure=value;},loseCommit(){commitLost=true;},
  auth(value){authenticated=value;},focus:()=>focus,
  message(data,{origin=location.origin,sender=window.parent}={}){const event=new window.Event('message');event.origin=origin;event.source=sender;event.data=data;window.dispatchEvent(event);},
  async select(value=true){const checkbox=$('grid').querySelector('[data-banner]');checkbox.checked=value;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));await tick();}
 };
}

test('saved banners come first, selection is scoped and keyboard focus returns; searches have recovery',async()=>{
 const f=await setup();assert.equal(f.$('library').hidden,false);assert(!f.$('upload-panel').open);
 assert.match(f.$('count').textContent,/1개 배너/);assert.equal(f.$('grid').querySelectorAll('input').length,1);
 await f.select();assert.deepEqual(f.selected(),[base.id]);assert.match(f.$('status').textContent,/표시했습니다/);assert.equal(f.focus().dataset.banner,base.id);
 assert.equal(f.calls.at(-1)[0],'channels/'+id+'/banner-selection');
 assert.equal(f.messages.at(-1).saving,false);assert(f.messages.some(m=>m.type==='creo-broadcast-settings-saved'&&m.channelId===id));
 f.$('search').value='없는 검색';f.$('search').dispatchEvent(new f.window.Event('input'));
 assert.match(f.$('grid').textContent,/검색 초기화/);f.$('grid').querySelector('button').click();assert.equal(f.$('grid').querySelectorAll('input').length,1);
 await f.select(false);f.$('filter').value='selected';f.$('filter').dispatchEvent(new f.window.Event('change'));assert.match(f.$('grid').textContent,/조건에 맞는/);
});

test('upload locks duplicates and close; successful registration updates the list without a fragile follow-up read',async()=>{
 const f=await setup();f.choose();assert.equal(f.$('banner-name').value,'배너');assert.equal(f.messages.at(-1).dirty,true);
 let finish;f.hold(new Promise(resolve=>{finish=resolve;}));const pending=f.submit();await tick();await f.submit();
 assert.equal(f.uploads.length,1);assert.equal(f.$('upload-fields').disabled,true);assert.equal(f.$('close').disabled,true);
 f.message({type:'creo-close-banner-request'});assert(!f.messages.some(m=>m.type==='creo-close-banner-library'));assert.match(f.$('status').textContent,/처리가 끝난/);
 finish();await pending;assert.equal(f.$('banner-name').value,'');assert.equal(f.$('banner-file').files.length,0);assert.equal(f.$('upload-fields').disabled,false);
 assert.equal(f.$('grid').querySelectorAll('input').length,2);assert.equal(f.focus().dataset.banner,'banner:/uploaded-1.png');
 assert.equal(f.calls.filter(([p])=>p==='banner-library').length,1);assert(f.calls.every(([p,o])=>p!=='banner-library'||o));assert.equal(f.messages.at(-1).dirty,false);assert.equal(f.messages.at(-1).saving,false);
});

test('failed metadata and lost committed response retry with the same uploaded URL and keep one record',async()=>{
 for(const lost of [false,true]){
  const f=await setup();f.choose();f.edit('배송 안내');
  if(lost)f.loseCommit();else f.fail(Error('목록 저장 실패. 다시 시도해 주세요.'));
  await f.submit();assert.equal(f.$('banner-name').value,'배송 안내');assert.equal(f.$('banner-file').files.length,1);
  assert.equal(f.$('error-box').hidden,false);assert.equal(f.focus(),f.$('error'));assert.equal(f.$('retry').hidden,false);
  f.fail(null);await f.$('retry').onclick();assert.equal(f.uploads.length,1);
  const writes=f.calls.filter(([p])=>p==='banner-library');assert.equal(writes.length,2);assert.equal(writes[0][1].record.imageUrl,writes[1][1].record.imageUrl);
  assert.equal(f.records.size,2);assert.equal(f.messages.at(-1).dirty,false);
 }
});

test('failed file upload retains input and retry works; changing files invalidates an earlier upload',async()=>{
 const f=await setup();f.choose();f.failUpload(Error('파일 전송 실패. 다시 시도해 주세요.'));await f.submit();
 assert.equal(f.$('banner-file').files.length,1);assert.equal(f.calls.filter(([p])=>p==='banner-library').length,0);
 f.failUpload(null);f.fail(Error('등록 실패. 다시 시도해 주세요.'));await f.$('retry').onclick();assert.equal(f.uploads.length,2);
 f.choose(new File(['new'],'다른 사진.jpg',{type:'image/jpeg'}));f.fail(null);await f.submit();assert.equal(f.uploads.length,3);
 assert.equal(f.uploads.at(-1)[1].mimeType,'image/jpeg');assert(f.revoked.length>=2);
});

test('close and reset require explicit discard, and standalone unload protects both file and name',async()=>{
 const f=await setup();f.edit('작성 중');f.$('close').onclick();assert.equal(f.$('discard-dialog').open,true);
 f.$('keep-editing').onclick();assert.equal(f.$('banner-name').value,'작성 중');assert(!f.messages.some(m=>m.type==='creo-close-banner-library'));
 let event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 f.window.frameElement={dataset:{layoutDraftHost:'1'}};event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
 f.message({type:'creo-close-banner-request'},{origin:'https://foreign.invalid'});assert.equal(f.$('discard-dialog').open,false);
 f.message({type:'creo-close-banner-request'},{sender:{}});assert.equal(f.$('discard-dialog').open,false);
 f.message({type:'creo-close-banner-request'});f.$('discard-upload').onclick();assert.equal(f.$('banner-name').value,'');assert.equal(f.messages.at(-1).type,'creo-close-banner-library');
 f.choose();f.$('reset-upload').onclick();assert.equal(f.$('discard-dialog').open,true);f.$('discard-upload').onclick();assert.equal(f.$('banner-file').files.length,0);assert.equal(f.focus(),f.$('banner-file'));
});

test('invalid file/name and mismatched round never write, while a failed selection retries the same intent',async()=>{
 const wrong=await setup({wrongChannel:true});assert.equal(wrong.$('library').hidden,true);assert.equal(wrong.$('upload-fields').disabled,true);wrong.choose();await wrong.submit();assert.equal(wrong.uploads.length,0);
 const f=await setup();await f.submit();assert.equal(f.$('banner-file').getAttribute('aria-invalid'),'true');
 f.choose();f.edit(' ');await f.submit();assert.equal(f.$('banner-name').getAttribute('aria-invalid'),'true');
 f.choose(new File(['x'],'unsupported.svg',{type:'image/svg+xml'}));f.edit('이름');await f.submit();assert.match(f.$('error').textContent,/PNG/);assert.equal(f.uploads.length,0);
 f.fail(Error('송출 반영 실패. 다시 시도해 주세요.'));await f.select();assert.deepEqual(f.selected(),[]);assert.equal(f.$('grid').querySelector('input').hasAttribute('checked'),false);
 f.fail(null);await f.$('retry').onclick();assert.deepEqual(f.selected(),[base.id]);
 const writes=f.calls.filter(([p])=>p.endsWith('banner-selection'));assert.deepEqual(writes[0],writes[1]);
});

test('expired authentication retains the uploaded file and title through login, then registration resumes once',async()=>{
 const f=await setup();f.choose();f.edit('다시 로그인 후 등록');f.fail(Object.assign(Error('인증 만료'),{status:401}));await f.submit();
 assert.equal(f.$('login').hidden,false);assert.equal(f.$('main').hidden,true);assert.equal(f.$('banner-file').files.length,1);
 f.auth(false);await f.$('login').onsubmit({preventDefault(){}});assert.equal(f.$('login-error').hidden,false);assert.equal(f.$('banner-name').value,'다시 로그인 후 등록');
 f.auth(true);f.fail(null);await f.$('login').onsubmit({preventDefault(){}});assert.equal(f.$('main').hidden,false);assert.equal(f.$('banner-name').value,'다시 로그인 후 등록');
 await f.submit();assert.equal(f.uploads.length,1);assert.equal(f.records.size,2);
});
