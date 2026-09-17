(function(root){
  'use strict';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  function parentNames(row){
    const entry=row.entry,facts=entry.status==='approved'?entry.approved:entry.submission||entry.approved||entry;
    const parents=['sire','dam'].map(role=>{
      const current=row.group.parents?.find(parent=>parent.id===facts[role+'Id']);
      const name=clean(current?current.name:facts.parents?.find(parent=>parent.role===role)?.name);
      return name?{role,name}:null;
    }).filter(Boolean);
    return parents.length===2?parents.map(parent=>parent.name).join(' × '):parents.map(parent=>(parent.role==='sire'?'부 ':'모 ')+parent.name).join('');
  }
  function label(row,allocation){
    const entry=row.entry,facts=entry.status==='approved'?entry.approved:entry.submission||entry.approved||entry;
    const lot=allocation.find(i=>i.id===entry.itemId)?.code||entry.lot||entry.code;
    return {kind:'identification',lot_number:lot,company:row.group.vendor.name,traits:[{male:'수컷',female:'암컷',unknown:'미구분'}[facts.sex],facts.weight?facts.weight+'g':''].filter(Boolean).join(' '),parents:parentNames(row),source_ref:entry.code};
  }
  function verifySnapshot(selection,allocation,fresh){
    const rows=fresh.groups.flatMap(group=>group.entries.map(entry=>({entry,group})));
    selection.forEach(selected=>{
      const current=rows.find(r=>r.entry.id===selected.entry.id&&r.group.vendor.id===selected.group.vendor.id);
      if(!current||current.entry.version!==selected.entry.version||JSON.stringify(label(current,fresh.allocation))!==JSON.stringify(label(selected,allocation)))throw Error('출품 정보가 변경됐어요. 닫고 새로고침한 뒤 다시 출력해 주세요.');
      if(fresh.allocation.find(i=>i.id===current.entry.itemId)?.order!==allocation.find(i=>i.id===selected.entry.itemId)?.order)throw Error('편성 순서가 변경됐어요. 닫고 새로고침한 뒤 다시 출력해 주세요.');
    });
  }
  const formatKey='creo.entry-label-format';
  const normalizeFormat=value=>value==='fold'?'fold':'standard';
  function printLabels(labels,format){
    return labels.map(label=>format==='fold'?{...label,format:'fold'}:{...label});
  }
  function previewHtml(labels,format,esc){
    return labels.map(l=>{
      const identity=`<div class="identity-vendor">${esc(clean(l.company))}</div><div class="identity-code">${esc(clean(l.lot_number))}</div>`;
      if(format==='fold')return `<div class="identity-fold-sheet"><section class="identity-label identity-fold"><div class="identity-face">${identity}</div><div class="identity-fold-line" aria-hidden="true"></div><div class="identity-face">${identity}</div></section></div>`;
      return `<section class="identity-label">${identity}<div class="identity-facts">${esc(l.traits)}</div>${l.parents?`<div class="identity-parents">${esc(l.parents)}</div>`:''}<div class="identity-source">${esc(l.source_ref)}</div></section>`;
    }).join('');
  }
  function checkPrinterFormat(status,format){
    if(!status.identificationLabels)throw Error('밴드 모니터링 앱을 재실행하면 식별 라벨 출력이 연결돼요.');
    if(format==='fold'&&!status.identificationLabelFormats?.includes('fold'))throw Error('접는형은 업데이트된 밴드 모니터링 앱을 실행해야 출력할 수 있어요. 앱을 재실행하거나 기존형을 선택해 주세요.');
  }
  function create({document,client,endpoint,channel}){
    const $=id=>document.getElementById(id),dialog=$('entry-label-dialog'),esc=client.escapeHtml;
    const formatInputs=[...document.querySelectorAll('input[name="entry-label-format"]')];
    let selection=[],labels=[],allocationSnapshot=[],opener=null,busy=false,openedChannel='',outside=false,format='standard';
    try{format=normalizeFormat(window.localStorage.getItem(formatKey));}catch{}
    function message(text,error=false){$('label-print-status').textContent=error?'':text;$('label-print-error').textContent=error?text:'';$('label-print-error').hidden=!error;}
    function setBusy(value){busy=value;['b1-entry-print','browser-label-print','close-labels'].forEach(id=>$(id).disabled=value);formatInputs.forEach(input=>input.disabled=value);}
    function render(){
      formatInputs.forEach(input=>input.checked=input.value===format);
      $('entry-label-preview').innerHTML=previewHtml(labels,format,esc);
      $('label-count').textContent=`${labels.length}장 · ${format==='fold'?'30×50mm 세로':'50×30mm'}`;
      $('label-format-hint').textContent=format==='fold'?'위·옆면 각 30×25mm · 중앙 점선에서 접기':'업체명·번호·개체 정보';
      // Scale long names/codes inside the physical label; never truncate an identifier.
      for(const el of document.querySelectorAll('.identity-fold .identity-vendor,.identity-fold .identity-code')){
        let size=parseFloat(window.getComputedStyle(el).fontSize);
        while(size>4&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)){size-=.5;el.style.fontSize=size+'px';}
        if(el.style.fontSize)el.style.fontSize=(size*.97/$('entry-label-preview').querySelector('.identity-label').clientWidth*100)+'cqw';
      }
    }
    formatInputs.forEach(input=>input.addEventListener('change',()=>{
      if(busy||!input.checked)return;
      format=normalizeFormat(input.value);try{window.localStorage.setItem(formatKey,format);}catch{}
      message('');render();
    }));
    async function verify(){
      if(channel()!==openedChannel)throw Error('경매가 변경됐어요. 라벨을 다시 열어 주세요.');
      const fresh=await client.api(endpoint());
      if(fresh.channel?.id!==openedChannel)throw Error('경매를 다시 확인해 주세요.');
      verifySnapshot(selection,allocationSnapshot,fresh);
    }
    function close(){if(!busy)dialog.close();}
    $('close-labels').onclick=close;dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>opener?.focus());
    const isOutside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
    dialog.addEventListener('pointerdown',e=>outside=isOutside(e));dialog.addEventListener('click',e=>{if(outside&&isOutside(e))close();outside=false;});
    $('browser-label-print').onclick=async()=>{if(busy)return;setBusy(true);try{await verify();message('용지 50×30mm · 배율 100% · 머리글/바닥글 끄기');window.print();}catch(e){message(e.message,true);}finally{setBusy(false);}};
    $('b1-entry-print').onclick=async()=>{
      if(busy)return;setBusy(true);message('프린터 연결 확인 중…');let submitted=false;
      try{
        await verify();
        const base='http://127.0.0.1:17876';
        const status=await fetch(base+'/v1/status',{signal:AbortSignal.timeout(5000)}).then(r=>r.json());
        checkPrinterFormat(status,format);
        if(status.ready===false)throw Error('앱에서 B1 PRO 연결을 확인한 뒤 다시 출력해 주세요.');
        submitted=true;
        const response=await fetch(base+'/v1/labels',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({labels:printLabels(labels,format)}),signal:AbortSignal.timeout(15000)}),result=await response.json();
        if(!response.ok||!result.ok||result.accepted!==labels.length)throw Error(result.error||'출력 대기열 접수를 확인하지 못했어요.');
        message(`${result.accepted}장 출력 대기열에 추가했어요.`);
      }catch(e){message(submitted?'접수 결과를 확인하지 못했어요. 앱의 출력 대기열을 확인한 뒤 다시 시도해 주세요.':e.message==='Failed to fetch'?'밴드 모니터링 앱과 B1 PRO 연결을 확인해 주세요.':e.message,true);}finally{setBusy(false);}
    };
    return {open(rows,allocation,button){selection=structuredClone(rows);allocationSnapshot=structuredClone(allocation);labels=rows.map(row=>label(row,allocation));opener=button;openedChannel=channel();message('');$('label-count').textContent=`${labels.length}장 · 50×30mm`;dialog.showModal();render();$('close-labels').focus();}};
  }
  const api={label,parentNames,verifySnapshot,printLabels,previewHtml,normalizeFormat,checkPrinterFormat,create};if(typeof module==='object'&&module.exports)module.exports=api;root.CreoEntryLabelPrint=api;
})(typeof window==='object'?window:globalThis);
