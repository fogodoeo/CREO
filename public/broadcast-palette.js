(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBroadcastPalette=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const presets=Object.freeze([
  {id:'graphite',name:'그라파이트',theme:{primary:'#414b5b',secondary:'#ccd4df',background:'#101319',surface:'#202630',text:'#f7faff'}},
  {id:'blue',name:'블루',theme:{primary:'#315fbb',secondary:'#98beff',background:'#0d131f',surface:'#172b49',text:'#f7faff'}},
  {id:'green',name:'그린',theme:{primary:'#217458',secondary:'#8eddbb',background:'#101915',surface:'#16392e',text:'#f7faff'}},
  {id:'purple',name:'퍼플',theme:{primary:'#7253af',secondary:'#ccb4ff',background:'#15111c',surface:'#34254b',text:'#f7faff'}},
  {id:'orange',name:'오렌지',theme:{primary:'#aa5525',secondary:'#ffc294',background:'#19130f',surface:'#432c20',text:'#f7faff'}},
  {id:'wine',name:'와인',theme:{primary:'#a8415d',secondary:'#ffadbf',background:'#1b1015',surface:'#442331',text:'#f7faff'}}
 ]);
 const keys=['primary','secondary','background','surface','text'];
 function match(theme){return presets.find(p=>keys.every(k=>p.theme[k].toLowerCase()===String(theme?.[k]).toLowerCase()))||null;}
 function custom(hex){if(!/^#[\da-f]{6}$/i.test(hex))throw new Error('색상을 선택해 주세요.');const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)),mix=(base,weight)=>'#'+rgb.map(v=>Math.round(v*weight+base*(1-weight)).toString(16).padStart(2,'0')).join('');return {primary:hex,secondary:mix(255,.45),background:mix(12,.08),surface:mix(18,.23),text:'#f7faff'};}
 function apply(doc,theme){for(const k of keys)if(/^#[\da-f]{6}$/i.test(theme?.[k]||''))doc.documentElement.style.setProperty('--'+k,theme[k]);}
 return {presets,match,custom,apply};
});
