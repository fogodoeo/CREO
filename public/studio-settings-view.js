(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoStudioSettingsView=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function create({document,compact=false,initialPage=1}){
  const form=document.getElementById('control-form'),groups=[],hosts=[];
  let initialized=false,scope='';
  function disclosure(label,className){const details=document.createElement('details');details.className=className;const summary=document.createElement('summary');summary.textContent=label;details.append(summary);return{details,summary};}
  if(!compact){
   document.documentElement.classList.add('settings-overview');
   document.querySelector('.page-tabs').hidden=true;
   for(const panel of document.querySelectorAll('[data-panel]')){
    const number=Number(panel.dataset.panel),group=disclosure(`${number}P`, 'settings-page');
    group.details.open=number===Number(initialPage);group.details.dataset.settingsPage=String(number);panel.before(group.details);group.details.append(panel);groups.push({...group,panel,number});
   }
  }
  for(const number of [2,3]){
   const name=form.querySelector(`[name="hostName${number}"]`),role=form.querySelector(`[name="hostRole${number}"]`);if(!name||!role)continue;
   const nameField=name.closest('.field'),roleField=role.closest('.field'),fields=nameField.parentElement;
   const group=disclosure(`진행자 ${number} 추가`, 'settings-disclosure host-extra'),row=document.createElement('div');row.className='fields';row.append(nameField,roleField);group.details.append(row);fields.after(group.details);hosts.push({...group,name,number});
  }
  // Keep host order after moving the optional rows out of the shared field grid.
  const primary=form.querySelector('[name="hostName1"]')?.closest('.fields');if(primary)for(const host of hosts.slice().reverse())primary.after(host.details);
  const extra=document.getElementById('shared-page2-controls');
  if(extra){const group=disclosure('비고·업체 이름·입찰 배경', 'settings-disclosure');extra.querySelector('.section-head')?.remove();extra.classList.remove('section');extra.before(group.details);group.details.append(extra);form.querySelector('[name="page2InfoOn"]')?.closest('.section')?.after(group.details);}
  for(const field of form.querySelectorAll('.field')){
   const input=field.querySelector('input[name],select[name],textarea[name]'),label=field.querySelector('label');
   if(input&&label){if(!input.id)input.id=`setting-${input.name}`;label.htmlFor=input.id;}
  }
  function refresh({channelId=scope,sharedTicker=false}={}){
   if(scope!==channelId){scope=channelId;initialized=false;}
   for(const group of groups){const tab=document.querySelector(`[data-page="${group.number}"]`);group.summary.textContent=`${group.number}P ${tab?.childNodes[0]?.textContent?.trim()||'화면 설정'}`;group.details.hidden=Boolean(tab?.hidden);}
   if(!initialized&&groups.length&&!groups.some(group=>!group.details.hidden&&group.details.open)){const first=groups.find(group=>!group.details.hidden);if(first)first.details.open=true;}
   for(const host of hosts){const name=host.name.value.trim();host.summary.textContent=name?`진행자 ${host.number} · ${name}`:`진행자 ${host.number} 추가`;if(!initialized)host.details.open=Boolean(name);}
   for(const number of [1,2]){
    const input=form.querySelector(`[name="page${number}Ticker"]`),section=input?.closest('.section');if(!section)continue;
    section.querySelector('h2').textContent=sharedTicker?'1P·2P 공통 자막':'순환 자막';
    section.querySelector('.section-head small').textContent=sharedTicker?'1P·2P 문구와 전환 간격을 함께 변경':'여러 문장을 순서대로 표시';
    input.closest('.field').querySelector('label').textContent='자막 문구 · 한 줄에 한 문장';
   }
   initialized=true;
  }
  form.addEventListener('input',event=>{if(/^hostName[23]$/.test(event.target.name||'')){const host=hosts.find(row=>row.name===event.target);host.summary.textContent=host.name.value.trim()?`진행자 ${host.number} · ${host.name.value.trim()}`:`진행자 ${host.number} 추가`;}});
  form.addEventListener('invalid',event=>{for(let parent=event.target.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;},true);
  return{refresh};
 }
 return{create};
});
