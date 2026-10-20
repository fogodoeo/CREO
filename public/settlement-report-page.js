'use strict';
(() => {
    const $=id=>document.getElementById(id), esc=CreoPlatform.escapeHtml;
    const channelId=new URLSearchParams(location.search).get('channel')||'';
    const archive=new URLSearchParams(location.search).get('archive')||'';
    const suffix='?'+new URLSearchParams({channel:channelId,...(archive?{archive}:{})});
    $('back').href='/main'+suffix;
    $('receipts').href='/organizer-shipping.html'+suffix;
    let report=null, view=0, busy=false, sequence=0;
    const won=value=>Number(value).toLocaleString('ko-KR')+'원';
    function renderTable() {
        if(!report)return;
        const spec=CreoSettlementWorkbook.sheets(report)[view];
        if(view===0)spec.columns=['vendorName','totalAmount','receivedAmount','remainingAmount','feeAmount','shippingAmount','shippingSupportAmount'].map(key=>spec.columns.find(c=>c.key===key));
        $('table').innerHTML='<caption class="empty" hidden>'+esc(spec.name)+'</caption><thead><tr>'+spec.columns.map(c=>'<th scope="col" class="'+(['money','number'].includes(c.type)?'num':'')+'">'+esc(c.label)+'</th>').join('')+'</tr></thead><tbody>'+(spec.rows.length?spec.rows.map(row=>'<tr>'+spec.columns.map(c=>{const value=row[c.key],numeric=['money','number'].includes(c.type);return '<td class="'+(numeric?'num':'')+'">'+esc(value==null||value===''?'—':numeric?Number(value).toLocaleString('ko-KR'):c.type==='datetime'?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):value)+'</td>';}).join('')+'</tr>').join(''):'<tr><td class="empty" colspan="'+spec.columns.length+'">아직 내역이 없어요</td></tr>')+'</tbody>';
        $('copy').textContent='구글시트용 복사';$('copy').setAttribute('aria-label',spec.name+' 구글시트용 복사');
        document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.view)===view)));
    }
    async function load() {
        if(busy)return;busy=true;const revision=++sequence;
        report=null;$('content').hidden=true;$('table').replaceChildren();$('round-name').textContent='';
        $('excel').disabled=$('copy').disabled=true;
        $('message').setAttribute('role','status');
        $('message').textContent='최신 내역을 확인하고 있어요…';
        try {
            if(!channelId)throw Error('채널 운영 화면에서 총정산을 열어 주세요.');
            const next=await CreoPlatform.api('channels/'+encodeURIComponent(channelId)+'/settlement-report'+(archive?'?archive='+encodeURIComponent(archive):''),{cache:'no-store'});
            if(revision!==sequence)return;
            if(next.channel?.id!==channelId)throw Error('채널이 일치하지 않습니다. 다시 열어 주세요.');
            if(next.scope!=='round'||next.round?.channelId!==channelId||next.round?.archiveId!==archive)throw Error('회차 정보가 일치하지 않습니다. 운영 홈에서 해당 회차를 다시 열어 주세요.');
            report=next;$('login').hidden=true;$('content').hidden=false;
            $('channel').textContent=report.channel.name;
            $('round-name').textContent=CreoSettlementWorkbook.scopeLabel(report);
            $('updated').textContent=new Date(report.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' 기준';
            $('fees').textContent=won(report.totals.feeAmount);$('support').textContent=won(report.totals.shippingSupportAmount);$('due').textContent=won(report.totals.remainingAmount);
            const notes=[];
            if(report.unassignedReceiptCount)notes.push('회차 미지정 입금 '+report.unassignedReceiptCount+'건 · 해당 회차 확인 전 합계에서 제외');
            if(report.totals.waitingCount)notes.push('진행 전 '+report.totals.waitingCount+'마리 포함');
            if(report.totals.missingPhoneCount)notes.push('연락처 확인 '+report.totals.missingPhoneCount+'마리');
            if(report.totals.missingShippingCount)notes.push('배송비 미확정 '+report.totals.missingShippingCount+'마리');
            $('attention').hidden=!notes.length;$('attention').textContent=notes.join(' · ');
            renderTable();$('message').textContent='';$('excel').disabled=$('copy').disabled=false;
        } catch(error) {
            report=null;$('content').hidden=true;$('table').replaceChildren();$('round-name').textContent='';
            $('message').setAttribute('role','alert');
            $('message').textContent=error.status===401?'운영자 로그인이 필요해요.':(error.message||'총정산 내역을 불러오지 못했어요.')+' 새로고침으로 다시 시도해 주세요.';
            if(error.status===401){report=null;$('content').hidden=true;$('table').replaceChildren();$('login').hidden=false;}
        } finally {busy=false;}
    }
    $('refresh').onclick=load;
    $('login').onsubmit=async event=>{event.preventDefault();if(busy)return;try{if(!await CreoPlatform.verifyAdmin($('password').value))throw Error('비밀번호를 확인해 주세요.');$('password').value='';await load();}catch(error){$('message').textContent=error.message;}};
    document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{view=Number(button.dataset.view);renderTable();});
    $('excel').onclick=()=>{
        if(!report||busy)return;
        try {
            const bytes=CreoSettlementWorkbook.xlsxBytes(report,XLSX);
            const name=(CreoSettlementWorkbook.scopeLabel(report)+' 총정산 '+report.generatedAt.slice(0,10)).replace(/[\\/:*?"<>|]/g,'-');
            const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
            const anchor=document.createElement('a');anchor.href=url;anchor.download=name+'.xlsx';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
            $('message').textContent='엑셀을 저장했어요. 다운로드 폴더에서 확인하세요.';
        }catch(error){$('message').textContent='엑셀을 저장하지 못했어요. '+error.message;}
    };
    $('copy').onclick=async()=>{
        if(!report||busy)return;
        try{await navigator.clipboard.writeText(CreoSettlementWorkbook.tsv(CreoSettlementWorkbook.sheets(report)[view]));$('message').textContent='표를 복사했어요. 구글시트의 A1 셀에 붙여넣으세요.';}
        catch(_){$('message').textContent='복사 권한을 확인하거나 엑셀을 내려받아 구글시트에서 열어 주세요.';}
    };
    load();
})();
