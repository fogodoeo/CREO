(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 let release=null,manifest=null,files=[],busy=false;
 function error(message){$('error').textContent=message||'';$('error').hidden=!message;}
 function status(message){$('status').textContent=message;}
 function lock(value){busy=value;for(const id of ['download','publish','manifest','installer','tested'])$(id).disabled=value;}
 async function api(path,options={}) {
   const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){if(response.status===401){$('login').hidden=false;$('publisher').hidden=true;$('release').hidden=true;}throw Error(result.error||'요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');}
   return result;
 }
 async function load(){
   error('');status('배포된 버전을 확인하고 있습니다…');
   try{
     const data=await api('/api/desktop-releases/stable');release=data.release;
     $('login').hidden=true;$('release').hidden=!release;$('publisher').hidden=false;
     if(release){$('release-heading').textContent='밴드 모니터 v'+release.version;$('release-meta').textContent=`${(release.size/1024/1024).toLocaleString('ko-KR',{maximumFractionDigits:1})} MB · 설정과 기록 유지`;$('notes').textContent=release.notes;status('설치 파일이 준비되었습니다.');}
     else status('아직 등록된 설치 파일이 없습니다. 검증한 첫 버전을 등록해 주세요.');
     const drive=await api('/api/operator-drive/entries');files=drive.entries.filter(e=>e.kind==='file'&&e.state==='ready'&&!e.trashRoot&&/\.exe$/i.test(e.name));
     $('installer').replaceChildren(new Option('설치 파일을 선택하세요',''),...files.map(e=>new Option(e.name,e.id)));
   }catch(e){error(e.message);status('');}
 }
 $('login').addEventListener('submit',async event=>{
   event.preventDefault();const button=event.submitter;button.disabled=true;
   try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인하고 다시 로그인해 주세요.');$('password').value='';await load();}
   catch(e){error(e.message);}finally{button.disabled=false;}
 });
 $('download').addEventListener('click',async()=>{
   if(busy||!release)return;lock(true);error('');
   try{const value=await api(`/api/desktop-releases/${encodeURIComponent(release.version)}/download`);const url=new URL(value.url);if(url.protocol!=='https:')throw Error('다운로드 주소를 확인하지 못했습니다. 다시 시도해 주세요.');const link=document.createElement('a');link.href=url.href;link.rel='noreferrer';document.body.append(link);link.click();link.remove();status('다운로드를 시작했습니다. 완료 후 설치 파일을 실행하세요.');}
   catch(e){error(e.message);}finally{lock(false);}
 });
 $('manifest').addEventListener('change',async()=>{
   manifest=null;error('');const file=$('manifest').files[0];if(!file)return;
   try{if(file.size>16384)throw Error('빌드에서 생성된 작은 배포 명세 JSON을 선택해 주세요.');const value=JSON.parse(await file.text());if(value.schema!==1||value.platform!=='windows-x64'||!/^\d+\.\d+\.\d+$/.test(value.version)||!/^[a-f0-9]{64}$/.test(value.sha256)||!Number.isSafeInteger(value.size))throw Error('배포 명세의 형식을 확인해 주세요.');manifest=value;const match=files.find(e=>e.name===value.fileName&&e.size===value.size);$('installer').value=match?.id||'';$('manifest-info').textContent=`v${value.version} · ${(value.size/1024/1024).toFixed(1)} MB · ${value.notes||'변경 내용 없음'}`;}
   catch(e){error(e instanceof SyntaxError?'JSON 파일을 읽지 못했습니다. 빌드에서 생성된 배포 명세를 선택해 주세요.':e.message);}
 });
 $('publish-form').addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;error('');
   const file=files.find(e=>e.id===$('installer').value);
   if(!manifest||!file||file.size!==manifest.size||file.name!==manifest.fileName){error('명세와 이름·크기가 같은 설치 파일을 선택해 주세요.');return;}
   if(!confirm(`v${manifest.version}을 모든 PC에 안내할 안정판으로 등록할까요? 등록한 설치 파일은 파일함에서 변경하거나 삭제할 수 없습니다.`))return;
   lock(true);
   try{await api('/api/desktop-releases/publish',{method:'POST',body:JSON.stringify({...manifest,fileId:file.id})});$('tested').checked=false;await load();status(`v${manifest.version}을 안정판으로 등록했습니다. 앱에서 새 버전을 확인할 수 있습니다.`);}
   catch(e){error(e.message);}finally{lock(false);}
 });
 load();
})();
