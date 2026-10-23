(function(root){
    'use strict';
    function create({document,context,api,onSaved,restoreFocus}){
        const Core=root.CreoWorkspaceItemDraft,esc=root.CreoPlatform.escapeHtml;
        const dialog=document.createElement('dialog');dialog.className='workspace-item-editor';dialog.setAttribute('aria-labelledby','item-editor-title');
        dialog.innerHTML='<form novalidate data-managed-draft="true"><header><div><p id="item-editor-scope"></p><h2 id="item-editor-title" tabindex="-1"></h2></div><button type="button" data-close aria-label="개체 편집 닫기">×</button></header><div class="item-editor-body"><div id="item-editor-fields"></div><p id="item-editor-error" role="alert" tabindex="-1" hidden></p></div><footer><button type="button" data-cancel>취소</button><button type="submit" class="primary" data-save>저장</button></footer></form>';
        const discard=document.createElement('dialog');discard.className='workspace-item-discard';discard.setAttribute('aria-labelledby','item-discard-title');discard.innerHTML='<h2 id="item-discard-title">입력한 내용을 버릴까요?</h2><p>저장하지 않은 변경 내용이 있어요.</p><div><button type="button" data-keep autofocus>계속 작성</button><button type="button" data-discard>입력 버리기</button></div>';
        document.body.append(dialog,discard);
        const form=dialog.querySelector('form'),fields=dialog.querySelector('#item-editor-fields'),error=dialog.querySelector('#item-editor-error'),save=form.querySelector('[data-save]');
        let values={},snapshot=null,opener=null,pendingLeave=null;
        const read=()=>({...values,...Object.fromEntries(new FormData(form)),photoEdits:photos.read()});
        const send=()=>{if(root.parent!==root)root.parent.postMessage({type:'creo:operator-dirty',dirty:dialog.open&&model.dirty(read()),busy:model.busy()},location.origin);};
        function message(value='',field){error.textContent=value;error.hidden=!value;form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));if(!value)return;if(field){const el=form.elements[field];if(el){el.closest('details')?.setAttribute('open','');el.setAttribute('aria-invalid','true');el.focus();return;}}error.focus();}
        function lock(busy){form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=busy||el.dataset.fixed==='true');dialog.setAttribute('aria-busy',String(busy));save.textContent=busy?'저장 중…':'저장';send();}
        function close(){if(!dialog.open)return;dialog.close();photos.reset();send();restoreFocus?.(opener,snapshot?.record?.id);}
        const photos=root.CreoWorkspaceItemPhotos.create({document,api,context,onChange:()=>send(),onError:failure=>message(failure.message),busy:()=>model.busy()});
        const model=Core.create({scope:()=>context().channelId,
            prepare:photos.prepare,
            write:(channelId,method,body)=>api(`channels/${encodeURIComponent(channelId)}/items${method==='PUT'?'/'+encodeURIComponent(body.record.id):''}`,{method,signal:AbortSignal.timeout(20000),body:JSON.stringify(body)}),
            onChange:lock,
            onSaved(record){snapshot.record=record;values=read();close();onSaved(record,snapshot.channelId);},
            onError(failure){message((failure.message||'저장하지 못했어요.')+' 입력은 유지됩니다. 확인 후 다시 저장해 주세요.',failure.field);}
        });
        const input=(key,label,type='text')=>`<label for="item-edit-${key}" class="${type==='textarea'?'full':''}">${esc(label)}${type==='textarea'?`<textarea id="item-edit-${key}" name="${key}" aria-describedby="item-editor-error">${esc(values[key])}</textarea>`:`<input id="item-edit-${key}" name="${key}" type="${type}" value="${esc(values[key])}" aria-describedby="item-editor-error" ${type==='number'?'step="any"':''}>`}</label>`;
        const select=(key,label,rows,fixed=false)=>`<label for="item-edit-${key}">${esc(label)}<select id="item-edit-${key}" name="${key}" aria-describedby="item-editor-error" ${fixed?'disabled data-fixed="true"':''}>${rows.map(([value,name])=>`<option value="${esc(value)}" ${String(value)===String(values[key])?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
        function choices(key,rows){const options=[['','선택 안 함'],...rows.map(row=>[row.id,row.name])];if(values[key]&&!options.some(([id])=>id===values[key]))options.push([values[key],'기존 정보 · '+values[key]]);return options;}
        function render(){
            const c=snapshot.channel,record=snapshot.record,groups=c?.features?.groups;
            let basic=input('name','개체 번호·이름');
            if(c?.features?.vendors)basic+=select('vendorId','출품 업체',choices('vendorId',snapshot.vendors));
            basic+=input('category','모프·분류');if(groups)basic+=select('groupId',c.terminology?.group||'그룹',choices('groupId',c.groups||[]));
            const sexes=[['','미입력'],['U','미구분'],['M','수컷'],['F','암컷'],['PM','수컷 추정'],['PF','암컷 추정']];if(!sexes.some(([key])=>key===values.sex))sexes.push([values.sex,'기존 정보 · '+values.sex]);
            const validDate=!values.hatchDate||/^\d{4}-\d{2}-\d{2}$/.test(values.hatchDate)&&Number.isFinite(Date.parse(values.hatchDate))&&new Date(values.hatchDate).toISOString().slice(0,10)===values.hatchDate;
            basic+=select('sex','성별',sexes)+input('weight','체중 (g)',!values.weight||/^\d+(\.\d+)?$/.test(values.weight)?'number':'text')+input('hatchDate','출생일',validDate?'date':'text')+input('note','비고','textarea');
            let extra=input('lotNumber','진행 순서','number')+input('startPrice','시작가 (원)','number');if(groups||Number(values.points))extra+=input('points','포인트','number');
            if(c?.vendorSettlement?.enabled){extra=select('auctionKind','출품 구분',[['normal','일반 출품'],['event','이벤트 · 수수료 면제']])+input('broadcastDate','방송일',/^\d{4}-\d{2}-\d{2}$/.test(values.broadcastDate)?'date':'text')+extra;}
            const states=[['waiting','대기'],['sold','낙찰'],['passed','유찰'],['cancelled','취소']];
            if(!states.some(([value])=>value===values.status))states.push([values.status,values.status==='live'?'진행 중':'기존 상태 유지']);
            const result=select('status','경매 상태',states,record?.status==='live')+input('soldPrice','낙찰가 (원)','number')+input('winnerName','낙찰자')+input('winnerAlias','방송에 표시할 낙찰자 이름');
            fields.innerHTML=`<div class="item-editor-fields">${basic}</div><details><summary>사진·부모 정보</summary><div class="item-editor-fields">${input('sireName','부개체 이름')+input('damName','모개체 이름')}</div><div id="item-editor-photos"></div></details><details><summary>경매 설정 · ${esc(values.lotNumber)}번째</summary><div class="item-editor-fields">${extra}</div></details><details><summary>낙찰 정보${record?.status==='sold'?' · 낙찰 완료':record?.status==='cancelled'?' · 취소':''}</summary><div class="item-editor-fields">${result}</div></details>`;
            photos.mount(fields.querySelector('#item-editor-photos'),record);
            if((snapshot.round?.date||c?.nationalRound?.date)===values.broadcastDate&&form.elements.broadcastDate)form.elements.broadcastDate.readOnly=true;
            if(form.elements.auctionKind&&!record)form.elements.auctionKind.addEventListener('change',()=>{if(form.elements.auctionKind.value==='event'){const names=new Set(snapshot.items.map(i=>i.name));let n=1;while(names.has('E'+String(n).padStart(2,'0')))n++;form.elements.name.value='E'+String(n).padStart(2,'0');send();}});
        }
        function leave(action){if(model.busy()){message('저장 중입니다. 완료되면 이동할 수 있어요.');return false;}if(dialog.open&&(model.dirty(read())||model.uncertain())){pendingLeave=action;discard.showModal();return false;}action();return true;}
        function open(record,trigger){return leave(()=>{snapshot={...context(),record:record?structuredClone(record):null};values=model.open(record,snapshot);opener=trigger||document.activeElement;render();message();dialog.querySelector('#item-editor-scope').textContent=snapshot.channel?.name||'선택한 방송일';dialog.querySelector('#item-editor-title').textContent=record?`${record.name||'개체'} 수정`:'개체 추가';if(!dialog.open)dialog.showModal();dialog.querySelector('#item-editor-title').focus();send();});}
        form.addEventListener('input',send);form.addEventListener('change',send);
        form.onsubmit=event=>{event.preventDefault();message();return model.save(read());};
        form.querySelector('[data-close]').onclick=form.querySelector('[data-cancel]').onclick=()=>leave(close);
        dialog.addEventListener('cancel',event=>{event.preventDefault();leave(close);});
        discard.querySelector('[data-keep]').onclick=()=>{pendingLeave=null;discard.close();};
        discard.querySelector('[data-discard]').onclick=()=>{const action=pendingLeave;pendingLeave=null;discard.close();action?.();};
        discard.addEventListener('cancel',()=>{pendingLeave=null;});
        root.addEventListener('beforeunload',event=>{if(dialog.open&&(model.busy()||model.dirty(read())||model.uncertain())){event.preventDefault();event.returnValue='';}});
        root.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===root.parent&&event.data?.type==='creo:operator-navigation-blocked'&&model.busy())message('저장 중입니다. 완료되면 이동할 수 있어요.');});
        return {open,busy:model.busy,isOpen:()=>dialog.open,leave,close};
    }
    root.CreoWorkspaceItemEditor={create};
})(window);
