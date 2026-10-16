(function(root){
    'use strict';
    const labels={missing_phone:'번호 확인 필요',not_sent:'발송 기록 없음',queued:'발송 대기',sending:'발송 중',sent:'알리고 접수',external:'외부 발송 확인',configuration_pending:'발송 설정 확인',failed:'발송 실패',delivery_unknown:'발송 결과 확인',expired:'발송 중지'};
    function mount({getChannelId,getTab,refresh}){
        const esc=root.CreoPlatform.escapeHtml,host=document.createElement('section');
        host.className='buyer-contact-panel';host.hidden=true;document.getElementById('table-wrap').before(host);
        let rows=[],all=false,loadedChannel='',sequence=0,loading=false,dialog=null,message='';
        function paint(){
            const count=rows.filter(r=>r.attention).length,visible=all?rows:rows.filter(r=>r.attention);
            host.innerHTML=`<div class="contact-heading"><h2>낙찰자 연락처·발송 <span>${count?'확인 필요 '+count+'건':'확인 필요 없음'}</span></h2><button type="button" data-contact-toggle>${all?'확인 필요만':'전체 '+rows.length+'건'}</button></div><p class="contact-context">알리고 접수는 수신 완료와 다릅니다. 외부에서 보낸 문자는 별도 확인해 주세요.</p><div class="contact-rows">${visible.map(r=>`<article class="contact-row"><b>${esc(r.lot)}</b><div><strong>${esc(r.name)}</strong><span>${esc(r.phone||'번호 없음')}</span></div><span class="contact-state ${r.attention?'needs-attention':''}">${esc(labels[r.status]||'확인 필요')}</span><button type="button" data-contact-open="${esc(r.itemId)}">번호·발송</button></article>`).join('')}</div><p class="contact-message" role="status"></p>`;
            host.querySelector('.contact-message').textContent=message;
            host.querySelector('[data-contact-toggle]').onclick=()=>{all=!all;paint()};
            host.querySelectorAll('[data-contact-open]').forEach(b=>b.onclick=()=>open(b.dataset.contactOpen,b));
        }
        async function load(){
            const channel=getChannelId();host.hidden=!channel||!['items','shipping'].includes(getTab());
            if(host.hidden||loading||dialog)return;
            const ticket=++sequence;loading=true;
            if(channel!==loadedChannel){rows=[];host.innerHTML='<p role="status">낙찰자 확인 중…</p>';all=false;message='';}
            try{const data=await root.CreoPlatform.api(`channels/${encodeURIComponent(channel)}/buyer-contacts`);if(ticket!==sequence||channel!==getChannelId())return;rows=data.rows;loadedChannel=channel;paint();}
            catch(e){if(channel===getChannelId())host.innerHTML=`<p role="alert">${esc(e.message)}</p><button type="button" data-contact-retry>다시 불러오기</button>`;host.querySelector('[data-contact-retry]')?.addEventListener('click',load);}
            finally{loading=false;if(channel!==getChannelId())load();}
        }
        async function open(id,opener){
            if(dialog)return;
            let row=rows.find(r=>r.itemId===id);
            if(!row){await load();row=rows.find(r=>r.itemId===id)}
            if(!row)return;
            const channel=getChannelId();dialog=document.createElement('dialog');dialog.className='buyer-contact-dialog';
            dialog.setAttribute('aria-labelledby','buyer-contact-title');
            dialog.innerHTML=`<form><h2 id="buyer-contact-title">${esc(row.lot)} · 연락처·발송</h2><p class="contact-winner">${esc(row.rawName||row.name)}</p><p class="contact-state">${esc(labels[row.status])}${row.sentAt?' · '+esc(new Date(row.sentAt).toLocaleString('ko-KR')):''}</p><label>휴대전화 번호<input name="phone" type="tel" inputmode="tel" autocomplete="off" value="${esc(row.phone)}" required aria-describedby="contact-error"></label><label class="contact-confirm"><input type="checkbox" name="confirmed"> 이 낙찰자의 번호를 확인했어요</label><p id="contact-error" role="alert" tabindex="-1"></p><div class="contact-dialog-actions"><button type="button" data-contact-close>닫기</button><button type="submit" name="action" value="save">번호만 저장</button><button type="submit" name="action" value="send" class="contact-primary">저장하고 알림톡 보내기</button></div>${row.phone?'<button type="button" class="contact-external">외부에서 이미 발송했어요</button>':''}</form>`;
            const form=dialog.querySelector('form'),error=dialog.querySelector('#contact-error');let busy=false,pending=null;
            const close=()=>{if(!busy)dialog.close()};dialog.querySelector('[data-contact-close]').onclick=close;
            dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
            dialog.addEventListener('close',()=>{dialog.remove();dialog=null;opener?.isConnected&&opener.focus();load()},{once:true});
            async function submit(action){
                if(busy)return;error.textContent='';
                const value=form.elements.phone.value;
                if(!form.elements.confirmed.checked){error.textContent='낙찰자와 번호를 확인한 후 체크해 주세요.';form.elements.confirmed.focus();return;}
                if(action==='send'&&['sent','external'].includes(row.status)&&!confirm(`${row.lot}은 발송 기록이 있어요. ${value}로 다시 보낼까요?`))return;
                if(action==='external'&&!confirm(`${row.lot} 안내를 ${row.phone}로 직접 발송한 것이 맞나요? 실제 문자는 보내지 않고 확인 기록만 남깁니다.`))return;
                const signature=JSON.stringify([value,action]);
                if(!pending||pending.signature!==signature)pending={signature,body:{itemId:id,phone:value,action,confirmed:true,requestId:crypto.randomUUID(),saleId:row.saleId,expectedUpdatedAt:row.updatedAt}};
                busy=true;[...form.elements].forEach(e=>e.disabled=true);
                try{
                    const result=await root.CreoPlatform.api(`channels/${encodeURIComponent(channel)}/buyer-contacts`,{method:'POST',body:JSON.stringify(pending.body)});
                    message=result.notification?.status==='configuration_pending'?'번호 저장 완료 · 알림 발송 설정 확인 필요':result.notification?'번호 저장 완료 · 알림톡 발송 대기':action==='external'?'외부 발송 확인 기록 완료':'번호 저장 완료';
                    busy=false;dialog.close();await refresh();await load();
                }catch(e){if(e.status&&e.status<500)pending=null;error.textContent=e.message;error.focus();}
                finally{busy=false;if(dialog)[...form.elements].forEach(e=>e.disabled=false);}
            }
            form.onsubmit=e=>{e.preventDefault();submit(e.submitter?.value||'save')};
            dialog.querySelector('.contact-external')?.addEventListener('click',()=>submit('external'));
            document.body.append(dialog);dialog.showModal();form.elements.phone.focus();
        }
        document.addEventListener('creo:workspace-render',load);
        document.addEventListener('click',event=>{const button=event.target.closest('[data-buyer-contact]');if(button)open(button.dataset.buyerContact,button)});
        setInterval(()=>{if(!document.hidden)load()},15000);
        return{load,open};
    }
    root.CreoBuyerContactManager={mount,labels};
})(window);
