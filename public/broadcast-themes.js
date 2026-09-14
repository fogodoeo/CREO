(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBroadcastThemes=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // New visual concepts belong here and in broadcast-themes.css, never in auction rules.
 const presets=Object.freeze([
  Object.freeze({id:'base',name:'기본',description:'단정한 기본 박스',frame:''}),
  Object.freeze({id:'pixel',name:'픽셀',description:'픽셀 프레임',frame:'/assets/broadcast-themes/pixel-frame-v1.png'})
 ]);
 function resolve(id){return presets.find(p=>p.id===id)||presets[0]}
 function apply(doc,id){const theme=resolve(id);if(doc.body)doc.body.dataset.broadcastTheme=theme.id;return theme.id}
 return Object.freeze({presets,resolve,apply});
});
